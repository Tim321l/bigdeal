// Re-exports the authoritative engine/server types so the client shares a single source of
// truth with the backend instead of hand-duplicating shapes that could drift out of sync.
export type {
  ActionPayload,
  ActionType,
  Card,
  GameEvent,
  GameMode,
  MacroEvent,
  PendingReaction,
  PlayCardTarget,
  PropertyColor,
  TurnPhase,
} from '../../src/types/game';
export type { SanitizedGameState, SanitizedPendingAuction, SanitizedPlayer } from '../../src/server/sanitize';
export type {
  AckResult,
  ClientToServerEvents,
  JoinAckData,
  PublicRoomPlayer,
  RoomSummary,
  ServerToClientEvents,
} from '../../src/server/types';
