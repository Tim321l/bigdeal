import { describe, expect, it } from 'vitest';
import type { Card, Player, PropertyColor } from '../types/game';
import { checkWinner, countCompleteSets, hasWon } from './winCondition';

const emptyField = (): Record<PropertyColor, Card[]> => ({
  PUBLIC_HOUSING: [],
  OLD_TONG_LAU: [],
  ESTATE: [],
  COMMERCIAL_LUXURY: [],
  TRANSPORT: [],
});

const filler = (color: PropertyColor, count: number): Card[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${color}-${i}`, name: color, type: 'PROPERTY', value: 1, color }));

const makePlayer = (id: string, field: Partial<Record<PropertyColor, Card[]>> = {}): Player => ({
  id,
  name: id,
  hand: [],
  field: { ...emptyField(), ...field },
  bank: [],
});

describe('countCompleteSets', () => {
  it('counts only colors with 3+ cards', () => {
    const player = makePlayer('p1', {
      PUBLIC_HOUSING: filler('PUBLIC_HOUSING', 3),
      OLD_TONG_LAU: filler('OLD_TONG_LAU', 2),
      ESTATE: filler('ESTATE', 3),
    });
    expect(countCompleteSets(player)).toBe(2);
  });
});

describe('hasWon / checkWinner', () => {
  it('requires 3 complete sets to win', () => {
    const almost = makePlayer('p1', {
      PUBLIC_HOUSING: filler('PUBLIC_HOUSING', 3),
      OLD_TONG_LAU: filler('OLD_TONG_LAU', 3),
      ESTATE: filler('ESTATE', 2),
    });
    expect(hasWon(almost)).toBe(false);

    const winner = makePlayer('p2', {
      PUBLIC_HOUSING: filler('PUBLIC_HOUSING', 3),
      OLD_TONG_LAU: filler('OLD_TONG_LAU', 3),
      ESTATE: filler('ESTATE', 3),
    });
    expect(hasWon(winner)).toBe(true);
  });

  it('finds the winning player id in a GameState', () => {
    const winner = makePlayer('p2', {
      PUBLIC_HOUSING: filler('PUBLIC_HOUSING', 3),
      OLD_TONG_LAU: filler('OLD_TONG_LAU', 3),
      ESTATE: filler('ESTATE', 3),
    });
    const other = makePlayer('p1');
    const state = {
      turn: 1,
      activePlayerIndex: 0,
      players: [other, winner],
      deck: [],
      discardPile: [],
      activeMacroEvents: [],
      rngSeed: 1,
      phase: 'ACTION' as const,
      actionsPlayedThisTurn: 0,
    };
    expect(checkWinner(state)).toBe('p2');
  });
});
