import type { BotLevel } from '../engine/bot';
import type { ActionPayload, GameEvent, GameMode, GameState } from '../types/game';
import type { SanitizedGameState } from './sanitize';

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';

export interface RoomPlayer {
  /** Stable identity for this player for the whole room lifetime — used for ready/reconnect. */
  lobbyId: string;
  name: string;
  ready: boolean;
  connected: boolean;
  socketId?: string | undefined;
  /** Secret credential required to reclaim this seat after a disconnect. Never broadcast. */
  reconnectToken: string;
  /** Assigned once the game starts; equals the matching GameState.players[i].id. */
  gamePlayerId?: string | undefined;
  /** Present only for bot seats — no real socket ever connects for these. */
  bot?: { level: BotLevel } | undefined;
}

export interface Room {
  id: string;
  status: RoomStatus;
  seed: number;
  mode: GameMode;
  hostLobbyId: string;
  players: RoomPlayer[];
  gameState?: GameState | undefined;
  createdAt: number;
  /** Sockets watching without a seat — keyed by socket id, not a stable lobby identity, since a
   * spectator has no reconnect concept: refreshing just rejoins as a spectator again. */
  spectatorSocketIds: Set<string>;
  /** Capped ring buffer of finished games this room has played, most recent last — resets on
   * server restart (no database backing this, matching the no-deployment scope). */
  history: MatchResult[];
}

export interface MatchResult {
  mode: GameMode;
  winnerName: string;
  playerNames: string[];
  endedAt: number;
}

export interface PublicRoomPlayer {
  lobbyId: string;
  name: string;
  ready: boolean;
  connected: boolean;
  gamePlayerId?: string | undefined;
  bot?: { level: BotLevel } | undefined;
}

export interface RoomSummary {
  id: string;
  status: RoomStatus;
  mode: GameMode;
  hostLobbyId: string;
  players: PublicRoomPlayer[];
  /** Count only — spectators aren't named/listed individually, keeping the feature minimal. */
  spectatorCount: number;
}

export function toRoomSummary(room: Room): RoomSummary {
  return {
    id: room.id,
    status: room.status,
    mode: room.mode,
    hostLobbyId: room.hostLobbyId,
    players: room.players.map((player) => ({
      lobbyId: player.lobbyId,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
      gamePlayerId: player.gamePlayerId,
      bot: player.bot,
    })),
    spectatorCount: room.spectatorSocketIds.size,
  };
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface JoinAckData {
  roomId: string;
  lobbyId: string;
  reconnectToken: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: { playerName: string }, ack: (result: AckResult<JoinAckData>) => void) => void;
  'room:join': (payload: { roomId: string; playerName: string }, ack: (result: AckResult<JoinAckData>) => void) => void;
  'room:reconnect': (
    payload: { roomId: string; lobbyId: string; reconnectToken: string },
    ack: (result: AckResult<Record<string, never>>) => void,
  ) => void;
  'room:ready': (payload: { ready: boolean }, ack: (result: AckResult<{ started: boolean }>) => void) => void;
  'room:setMode': (payload: { mode: GameMode }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'room:addBot': (payload: { level: BotLevel }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'room:removeBot': (payload: { botLobbyId: string }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'game:intent': (payload: { action: ActionPayload }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'room:spectate': (payload: { roomId: string }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'room:history': (payload: { roomId: string }, ack: (result: AckResult<{ history: MatchResult[] }>) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (summary: RoomSummary) => void;
  'game:state': (state: SanitizedGameState) => void;
  'game:events': (events: GameEvent[]) => void;
}
