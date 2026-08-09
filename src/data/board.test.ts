import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, BOARD_TILES } from './board';
import { tileCard } from '../engine/board';

/** Mirrors BoardMap.tsx's gridPosition: which of the 4 board sides (by non-corner position range)
 * a tile belongs to. */
function sideOf(position: number): 'bottom' | 'left' | 'top' | 'right' | 'corner' {
  if (position === 0 || position === 8 || position === 16 || position === 24) return 'corner';
  if (position <= 7) return 'bottom';
  if (position <= 15) return 'left';
  if (position <= 23) return 'top';
  return 'right';
}

describe('board data', () => {
  it('has exactly 32 tiles at positions 0..31', () => {
    expect(BOARD_TILES).toHaveLength(BOARD_SIZE);
    expect(BOARD_TILES.map((t) => t.position)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });

  it('places all 25 PROPERTY cards on the board with no duplicates', () => {
    const propertyTiles = BOARD_TILES.filter((t) => t.kind === 'PROPERTY');
    expect(propertyTiles).toHaveLength(25);
    const cardIds = propertyTiles.map((t) => t.cardId);
    expect(new Set(cardIds).size).toBe(25);
  });

  it('spreads TRANSPORT tiles across at least 3 different board sides instead of clustering them', () => {
    const transportTiles = BOARD_TILES.filter((t) => t.kind === 'PROPERTY' && tileCard(t.position)?.color === 'TRANSPORT');
    expect(transportTiles).toHaveLength(5);
    const sides = new Set(transportTiles.map((t) => sideOf(t.position)));
    expect(sides.size).toBeGreaterThanOrEqual(3);
  });
});
