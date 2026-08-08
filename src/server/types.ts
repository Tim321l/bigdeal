import type { BotLevel } from '../engine/bot';
import type { ActionPayload, GameEvent, GameState } from '../types/game';
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
  hostLobbyId: string;
  players: RoomPlayer[];
  gameState?: GameState | undefined;
  createdAt: number;
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
  hostLobbyId: string;
  players: PublicRoomPlayer[];
}

export function toRoomSummary(room: Room): RoomSummary {
  return {
    id: room.id,
    status: room.status,
    hostLobbyId: room.hostLobbyId,
    players: room.players.map((player) => ({
      lobbyId: player.lobbyId,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
      gamePlayerId: player.gamePlayerId,
      bot: player.bot,
    })),
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
  'room:addBot': (payload: { level: BotLevel }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'room:removeBot': (payload: { botLobbyId: string }, ack: (result: AckResult<Record<string, never>>) => void) => void;
  'game:intent': (payload: { action: ActionPayload }, ack: (result: AckResult<Record<string, never>>) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (summary: RoomSummary) => void;
  'game:state': (state: SanitizedGameState) => void;
  'game:events': (events: GameEvent[]) => void;
}
