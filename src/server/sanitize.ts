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
  teamId?: number;
}

/** AUCTION_DRAFT: the lot is public, but it's a BLIND auction — bid amounts stay server-side
 * until AUCTION_RESOLVED reveals them all at once. Clients only learn who has bid, not how much. */
export interface SanitizedPendingAuction {
  cards: Card[];
  submittedPlayerIds: string[];
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
  pendingAuction?: SanitizedPendingAuction;
  /** BOSS_RAID only — the turn number the raid must be won by. */
  turnLimit?: number;
  /** BOSS_RAID only — set instead of winnerId when the turn limit expires without a win. */
  raidFailed?: boolean;
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
    ...(player.teamId !== undefined ? { teamId: player.teamId } : {}),
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
    ...(state.pendingAuction
      ? { pendingAuction: { cards: state.pendingAuction.cards, submittedPlayerIds: Object.keys(state.pendingAuction.bids) } }
      : {}),
    ...(state.turnLimit !== undefined ? { turnLimit: state.turnLimit } : {}),
    ...(state.raidFailed !== undefined ? { raidFailed: state.raidFailed } : {}),
    ...(state.winnerId ? { winnerId: state.winnerId } : {}),
    viewerPlayerId,
  };
}
