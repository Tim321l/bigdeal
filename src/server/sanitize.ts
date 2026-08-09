import type {
  Card,
  GameMode,
  GameState,
  MacroEvent,
  PendingReaction,
  Player,
  PropertyColor,
  TurnPhase,
} from '../types/game';

export interface SanitizedPlayer {
  id: string;
  name: string;
  handCount: number;
  /** Only present for the viewing player themselves — everyone else's cards stay hidden. */
  hand?: Card[];
  field: Record<PropertyColor, Card[]>;
  bank: Card[];
  eliminated?: boolean;
}

export interface SanitizedGameState {
  mode: GameMode;
  turn: number;
  activePlayerIndex: number;
  players: SanitizedPlayer[];
  /** The deck's contents are secret — only its size is shared. */
  deckCount: number;
  discardPile: Card[];
  activeMacroEvents: MacroEvent[];
  phase: TurnPhase;
  actionsPlayedThisTurn: number;
  pendingReaction?: PendingReaction;
  pendingRentMultiplier?: number;
  winnerId?: string;
  /** Which player's perspective this view was built for. */
  viewerPlayerId: string;
}

function sanitizePlayer(player: Player, viewerPlayerId: string): SanitizedPlayer {
  const isSelf = player.id === viewerPlayerId;
  return {
    id: player.id,
    name: player.name,
    handCount: player.hand.length,
    ...(isSelf ? { hand: player.hand } : {}),
    field: player.field,
    bank: player.bank,
    ...(player.eliminated ? { eliminated: true } : {}),
  };
}

/**
 * Builds the view of `state` that `viewerPlayerId` is allowed to see: every other player's hand
 * is collapsed to a count, the deck order/contents are hidden, and rngSeed is dropped entirely
 * since it would let a client predict future draws and macro-event triggers.
 */
export function sanitizeStateFor(state: GameState, viewerPlayerId: string): SanitizedGameState {
  return {
    mode: state.mode,
    turn: state.turn,
    activePlayerIndex: state.activePlayerIndex,
    players: state.players.map((player) => sanitizePlayer(player, viewerPlayerId)),
    deckCount: state.deck.length,
    discardPile: state.discardPile,
    activeMacroEvents: state.activeMacroEvents,
    phase: state.phase,
    actionsPlayedThisTurn: state.actionsPlayedThisTurn,
    ...(state.pendingReaction ? { pendingReaction: state.pendingReaction } : {}),
    ...(state.pendingRentMultiplier !== undefined ? { pendingRentMultiplier: state.pendingRentMultiplier } : {}),
    ...(state.winnerId ? { winnerId: state.winnerId } : {}),
    viewerPlayerId,
  };
}
