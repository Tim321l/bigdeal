import { randomInt, randomUUID } from 'node:crypto';
import { type BotLevel, decideBotAction } from '../engine/bot';
import { applyAction, initGame } from '../engine/stateManager';
import type { ActionPayload, GameEvent, GameMode, GameState } from '../types/game';
import type { Room, RoomPlayer } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

// Excludes 0/O and 1/I so room codes are easy to read aloud/type.
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
/** Safety valve against a pathological bot-only loop never yielding to a human. */
const MAX_BOT_STEPS = 500;

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

  createRoom(
    hostName: string,
    socketId: string,
    seed: number = randomInt(0, 2 ** 31),
  ): RoomResult<{ room: Room; lobbyId: string; reconnectToken: string }> {
    const player = this.makePlayer(hostName, socketId);
    const room: Room = {
      id: this.generateRoomCode(),
      status: 'LOBBY',
      seed,
      mode: 'CLASSIC',
      hostLobbyId: player.lobbyId,
      players: [player],
      createdAt: Date.now(),
    };
    this.rooms.set(room.id, room);
    return ok({ room, lobbyId: player.lobbyId, reconnectToken: player.reconnectToken });
  }

  joinRoom(
    roomId: string,
    playerName: string,
    socketId: string,
  ): RoomResult<{ room: Room; lobbyId: string; reconnectToken: string }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    if (room.status !== 'LOBBY') return err('Room is not accepting new players.');
    if (room.players.length >= MAX_PLAYERS) return err('Room is full.');

    const player = this.makePlayer(playerName, socketId);
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
  ): RoomResult<{ room: Room }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('Room not found.');
    const player = room.players.find((p) => p.lobbyId === lobbyId);
    if (!player) return err('You are not in this room.');
    if (player.reconnectToken !== reconnectToken) return err('Invalid reconnect token.');

    player.connected = true;
    player.socketId = socketId;
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
    }
    return ok({ room, events });
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
   * Drives every bot whose turn (or reaction) it currently is, one decision at a time, until a
   * human needs to act or the game ends. Runs directly through applyAction — bots have no
   * socket session to authenticate through submitIntent, and don't need one: this is trusted
   * server-internal decision-making, not untrusted client input.
   */
  processBotTurns(roomId: string): GameEvent[] {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'IN_PROGRESS' || !room.gameState) return [];

    const allEvents: GameEvent[] = [];
    for (let step = 0; step < MAX_BOT_STEPS; step++) {
      const actorId = this.currentActorId(room.gameState);
      if (!actorId) break;
      const actor = room.players.find((p) => p.gamePlayerId === actorId);
      if (!actor?.bot) break;

      const action = decideBotAction(room.gameState, actorId, actor.bot.level);
      const { nextState, events } = applyAction(room.gameState, action);
      room.gameState = nextState;
      allEvents.push(...events);
      if (nextState.phase === 'GAME_OVER') {
        room.status = 'FINISHED';
        break;
      }
    }
    return allEvents;
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
    if (state.phase === 'TURN_START' || state.phase === 'ACTION') return state.players[state.activePlayerIndex]?.id;
    return undefined;
  }

  private makePlayer(name: string, socketId: string): RoomPlayer {
    return {
      lobbyId: randomUUID(),
      name,
      ready: false,
      connected: true,
      socketId,
      reconnectToken: randomUUID(),
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
