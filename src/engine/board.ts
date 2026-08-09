import { BOARD_TILES } from '../data/board';
import { CARDS } from '../data/cards';
import type { Card, GameState, Player } from '../types/game';

/** The PROPERTY card a board tile represents, looked up from the shared CARDS pool — tiles never
 * duplicate value/color/rentTiers, they just reference a card id. */
export function tileCard(tileIndex: number): Card | undefined {
  const tile = BOARD_TILES[tileIndex];
  if (!tile?.cardId) return undefined;
  return CARDS.find((c) => c.id === tile.cardId);
}

/** Who owns a board tile right now — derived from field contents (the same representation a
 * deck-drawn property already uses), not a separate ownership map. Unowned if nobody's field
 * contains the tile's card. */
export function tileOwner(state: GameState, tileIndex: number): Player | undefined {
  const card = tileCard(tileIndex);
  if (!card?.color) return undefined;
  const color = card.color;
  return state.players.find((p) => p.field[color].some((c) => c.id === card.id));
}

/** Cash price to buy a tile's property outright — just its printed value. */
export function tilePrice(tileIndex: number): number {
  return tileCard(tileIndex)?.value ?? 0;
}
