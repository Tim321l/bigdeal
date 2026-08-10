import { randomInt, randomUUID } from 'node:crypto';
import { type BotLevel, decideBotAction } from '../engine/bot';
import { applyAction, initGame } from '../engine/stateManager';
import type { ActionPayload, GameEvent, GameMode, GameState } from '../types/game';
import { toAdminRoomSummary } from './types';
import type { AdminRoomSummary, MatchResult, Room, RoomPlayer } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

// Excludes 0/O and 1/I so room codes are easy to read aloud/type.
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
/** Safety valve against a pathological bot-only loop never yielding to a human. */
const MAX_BOT_STEPS = 500;
/** Ring-buffer cap for in-memory match history — oldest entries drop first. */
const MAX_HISTORY = 50;

export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): RoomResult<T> {
  return { ok: true, value };
}

function err<T>(error: string): RoomResult<T> {
  return { ok: false, error };
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Admin-dashboard-only — includes every player's IP, so this must never be broadcast to
   * regular player clients (see toAdminRoomSummary). */
  getRoomsSummary(): AdminRoomSummary[] {
    return [...this.rooms.values()].map(toAdminRoomSummary);
  }

  createRoom(
    hostName: string,
    socketId: string,
    ip?: string,
    seed: number = randomInt(0, 2 ** 31),
  ): RoomResult<{ room: Room; lobbyId: string; reconnectToken: string }> {
    const player = this.makePlayer(hostName, socketId, ip);
    const room: Room = {
      id: this.generateRoomCode(),
      status: 'LOBBY',
      seed,
      mode: 'CLASSIC',
      hostLobbyId: player.lobbyId,
      players: [player],
      createdAt: Date.now(),
      spectatorSocketIds: new Set(),
      history: [],
    };
    this.rooms.set(room.id, room);
    return ok({ room, lobbyId: player.lobbyId, reconnectToken: player.reconnectToken });
  }

  joinRoom(
    roomId: string,
    playerName: string,
    socketId: string,
    ip?: string,
  ): RoomResult<{ room: Room; lobbyId: string; reconnectToken: string }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.status !== 'LOBBY') return err('Room is not accepting new players.');
    if (room.players.length >= MAX_PLAYERS) return err('Room is full.');

    const player = this.makePlayer(playerName, socketId, ip);
    room.players.push(player);
    return ok({ room, lobbyId: player.lobbyId, reconnectToken: player.reconnectToken });
  }

  leaveRoom(roomId: string, lobbyId: string): RoomResult<{ room: Room | undefined }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.status !== 'LOBBY') return err('Cannot leave after the game has started.');

    room.players = room.players.filter((p) => p.lobbyId !== lobbyId);
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return ok({ room: undefined });
    }
    if (room.hostLobbyId === lobbyId) {
      room.hostLobbyId = room.players[0]!.lobbyId;
    }
    return ok({ room });
  }

  /**
   * Admin-dashboard-only: force a player out. In LOBBY this fully evicts them (same as
   * leaveRoom, host reassignment included) since a lingering disconnected seat would otherwise
   * block the room from ever starting. Mid-game there's no safe way to remove a seat without
   * breaking the engine's positional gamePlayerId assumptions, so this just marks them
   * disconnected instead — same effect as them dropping on their own. Either way the caller is
   * responsible for actually severing their live socket connection (this method only updates
   * room state); the returned socketId is who to disconnect.
   */
  kickPlayer(roomId: string, lobbyId: string): RoomResult<{ room: Room | undefined; socketId: string | undefined }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    const player = room.players.find((p) => p.lobbyId === lobbyId);
    if (!player) return err('That player is not in this room.');
    const socketId = player.socketId;

    if (room.status === 'LOBBY') {
      room.players = room.players.filter((p) => p.lobbyId !== lobbyId);
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        return ok({ room: undefined, socketId });
      }
      if (room.hostLobbyId === lobbyId) {
        room.hostLobbyId = room.players[0]!.lobbyId;
      }
      return ok({ room, socketId });
    }

    player.connected = false;
    player.socketId = undefined;
    return ok({ room, socketId });
  }

  /** Admin-dashboard-only: force-delete a room outright, mid-game or not. Returns every
   * connected player/spectator socket id still in it so the caller can disconnect them. */
  closeRoom(roomId: string): RoomResult<{ socketIds: string[] }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');

    const socketIds = [
      ...room.players.map((p) => p.socketId).filter((id): id is string => !!id),
      ...room.spectatorSocketIds,
    ];
    this.rooms.delete(roomId);
    return ok({ socketIds });
  }

  setReady(roomId: string, lobbyId: string, ready: boolean): RoomResult<{ room: Room; started: boolean }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.status !== 'LOBBY') return err('The game has already started.');
    const player = room.players.find((p) => p.lobbyId === lobbyId);
    if (!player) return err('You are not in this room.');

    player.ready = ready;

    let started = false;
    if (this.canStart(room)) {
      this.startGame(room);
      started = true;
    }
    return ok({ room, started });
  }

  reconnect(
    roomId: string,
    lobbyId: string,
    reconnectToken: string,
    socketId: string,
    ip?: string,
  ): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    const player = room.players.find((p) => p.lobbyId === lobbyId);
    if (!player) return err('You are not in this room.');
    if (player.reconnectToken !== reconnectToken) return err('Invalid reconnect token.');

    player.connected = true;
    player.socketId = socketId;
    player.ip = ip;
    return ok({ room });
  }

  disconnectSocket(roomId: string, lobbyId: string): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    const player = room.players.find((p) => p.lobbyId === lobbyId);
    if (!player) return err('You are not in this room.');

    player.connected = false;
    player.socketId = undefined;
    return ok({ room });
  }

  submitIntent(roomId: string, lobbyId: string, action: ActionPayload): RoomResult<{ room: Room; events: GameEvent[] }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.status !== 'IN_PROGRESS' || !room.gameState) return err('The game has not started yet.');

    const player = room.players.find((p) => p.lobbyId === lobbyId);
    if (!player || !player.gamePlayerId) return err('You are not part of this game.');
    // The engine trusts action.playerId as given, so the server — not the engine — is
    // responsible for refusing to let a socket act on behalf of anyone but itself.
    if (action.playerId !== player.gamePlayerId) return err('You may only act as your own player.');

    const { nextState, events } = applyAction(room.gameState, action);
    room.gameState = nextState;
    if (nextState.phase === 'GAME_OVER') {
      room.status = 'FINISHED';
      this.recordHistory(room, nextState);
    }
    return ok({ room, events });
  }

  /** Watch a room's broadcasts without occupying a seat — no ready-check participation, no
   * reconnect concept (a spectator who drops just rejoins fresh). Works at any room status so a
   * shared link can be opened either before or after the game starts. */
  spectate(roomId: string, socketId: string): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    room.spectatorSocketIds.add(socketId);
    return ok({ room });
  }

  unspectate(roomId: string, socketId: string): void {
    this.rooms.get(roomId)?.spectatorSocketIds.delete(socketId);
  }

  getHistory(roomId: string): RoomResult<{ history: MatchResult[] }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    return ok({ history: room.history });
  }

  setMode(roomId: string, hostLobbyId: string, mode: GameMode): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.hostLobbyId !== hostLobbyId) return err('Only the host can change the game mode.');
    if (room.status !== 'LOBBY') return err('Cannot change the game mode after the game has started.');

    room.mode = mode;
    return ok({ room });
  }

  addBot(roomId: string, hostLobbyId: string, level: BotLevel): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.hostLobbyId !== hostLobbyId) return err('Only the host can add a bot.');
    if (room.status !== 'LOBBY') return err('Cannot add a bot after the game has started.');
    if (room.players.length >= MAX_PLAYERS) return err('Room is full.');

    const botNumber = room.players.filter((p) => p.bot).length + 1;
    const bot: RoomPlayer = {
      lobbyId: randomUUID(),
      name: `機械人 ${botNumber} (Lv.${level})`,
      ready: true,
      connected: true,
      reconnectToken: randomUUID(),
      bot: { level },
    };
    room.players.push(bot);
    return ok({ room });
  }

  removeBot(roomId: string, hostLobbyId: string, botLobbyId: string): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.hostLobbyId !== hostLobbyId) return err('Only the host can remove a bot.');
    if (room.status !== 'LOBBY') return err('Cannot remove a bot after the game has started.');
    const bot = room.players.find((p) => p.lobbyId === botLobbyId);
    if (!bot?.bot) return err('That is not a bot in this room.');

    room.players = room.players.filter((p) => p.lobbyId !== botLobbyId);
    return ok({ room });
  }

  /**
   * Runs exactly one bot decision (its next action or reaction) and applies it — the primitive
   * the live server paces with real per-step delays (see socketServer.ts's runBotsAndBroadcast)
   * so a human watching can actually follow along one action at a time, instead of an entire bot
   * turn (or several bots' turns in a row) resolving in one instant, unpaced burst. Runs directly
   * through applyAction — bots have no socket session to authenticate through submitIntent, and
   * don't need one: this is trusted server-internal decision-making, not untrusted client input.
   * Returns null if it isn't currently a bot's turn (nothing to step).
   */
  processSingleBotStep(roomId: string): GameEvent[] | null {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'IN_PROGRESS' || !room.gameState) return null;
    const actorId = this.currentActorId(room.gameState);
    if (!actorId) return null;
    const actor = room.players.find((p) => p.gamePlayerId === actorId);
    if (!actor?.bot) return null;

    const action = decideBotAction(room.gameState, actorId, actor.bot.level);
    const { nextState, events } = applyAction(room.gameState, action);
    room.gameState = nextState;
    if (nextState.phase === 'GAME_OVER') {
      room.status = 'FINISHED';
      this.recordHistory(room, nextState);
    }
    return events;
  }

  /** Drives every bot whose turn (or reaction) it currently is, all the way through to a human's
   * turn or the game's end, in one synchronous batch — built on processSingleBotStep. Used by
   * tests and anywhere else that wants the end result without caring about pacing; the live
   * server uses processSingleBotStep directly instead, precisely so it *can* pace each step. */
  processBotTurns(roomId: string): GameEvent[] {
    const allEvents: GameEvent[] = [];
    for (let step = 0; step < MAX_BOT_STEPS; step++) {
      const events = this.processSingleBotStep(roomId);
      if (events === null) break;
      allEvents.push(...events);
      if (this.rooms.get(roomId)?.status !== 'IN_PROGRESS') break;
    }
    return allEvents;
  }

  /** Called exactly once per game, right where status first flips to FINISHED in both
   * submitIntent and processBotTurns — the IN_PROGRESS-only guards at the top of each mean
   * neither can reach this a second time for the same game. */
  private recordHistory(room: Room, finalState: GameState): void {
    const winnerName = finalState.raidFailed
      ? '全軍覆沒'
      : (room.players.find((p) => p.gamePlayerId === finalState.winnerId)?.name ?? '?');
    room.history.push({
      mode: room.mode,
      winnerName,
      playerNames: room.players.map((p) => p.name),
      endedAt: Date.now(),
    });
    if (room.history.length > MAX_HISTORY) room.history.shift();
  }

  /**
   * True if whoever needs to act right now (turn or reaction) is a bot. processBotTurns caps how
   * much work it does per call (MAX_BOT_STEPS) so one degenerate room can't block the event loop
   * for other rooms — callers use this to know whether to invoke it again to keep going, rather
   * than assuming one call always reaches a human's turn or the game's end.
   */
  isBotTurn(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'IN_PROGRESS' || !room.gameState) return false;
    const actorId = this.currentActorId(room.gameState);
    if (!actorId) return false;
    return !!room.players.find((p) => p.gamePlayerId === actorId)?.bot;
  }

  private currentActorId(state: GameState): string | undefined {
    if (state.phase === 'REACTION_WINDOW') return state.pendingReaction?.currentResponderId;
    // ROLL/TILE_DECISION (REAL_BIG_DEAL only): always the active player's own decision.
    if (state.phase === 'TURN_START' || state.phase === 'ACTION' || state.phase === 'ROLL' || state.phase === 'TILE_DECISION') {
      return state.players[state.activePlayerIndex]?.id;
    }
    // AUCTION_DRAFT: everyone bids, not just the active player — drive whichever seat (bot or
    // human) hasn't bid yet, in seat order. Once a human is next, this returns their id and the
    // bot-driving loop above correctly stops to wait for them.
    if (state.phase === 'AUCTION' && state.pendingAuction) {
      const auction = state.pendingAuction;
      return state.players.find((p) => !p.eliminated && auction.bids[p.id] === undefined)?.id;
    }
    return undefined;
  }

  private makePlayer(name: string, socketId: string, ip: string | undefined): RoomPlayer {
    return {
      lobbyId: randomUUID(),
      name,
      ready: false,
      connected: true,
      socketId,
      reconnectToken: randomUUID(),
      ip,
    };
  }

  private canStart(room: Room): boolean {
    // SYNDICATE needs exactly 4 for even 2v2 teams (seat parity assigns teams — see initGame).
    const meetsPlayerCount = room.mode === 'SYNDICATE' ? room.players.length === 4 : room.players.length >= MIN_PLAYERS;
    return room.status === 'LOBBY' && meetsPlayerCount && room.players.every((p) => p.connected && p.ready);
  }

  private startGame(room: Room): void {
    room.players.forEach((player, index) => {
      player.gamePlayerId = `player-${index + 1}`;
    });
    room.gameState = initGame(
      room.players.map((p) => p.name),
      room.seed,
      room.mode,
    );
    room.status = 'IN_PROGRESS';
  }

  private generateRoomCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_CHARS[randomInt(0, ROOM_CODE_CHARS.length)],
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
