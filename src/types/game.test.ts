import { describe, expect, it } from 'vitest';
import type { Card, GameState, Player, PropertyColor } from './game';

const emptyField = (): Record<PropertyColor, Card[]> => ({
  PUBLIC_HOUSING: [],
  OLD_TONG_LAU: [],
  ESTATE: [],
  COMMERCIAL_LUXURY: [],
  TRANSPORT: [],
});

describe('game types', () => {
  it('builds a minimal valid GameState', () => {
    const player: Player = {
      id: 'p1',
      name: 'Player 1',
      hand: [],
      field: emptyField(),
      bank: [],
    };

    const state: GameState = {
      mode: 'CLASSIC',
      turn: 1,
      activePlayerIndex: 0,
      players: [player],
      deck: [],
      discardPile: [],
      activeMacroEvents: [],
      rngSeed: 42,
      phase: 'TURN_START',
      actionsPlayedThisTurn: 0,
    };

    expect(state.players).toHaveLength(1);
    expect(state.players[0]?.field.TRANSPORT).toEqual([]);
  });
});
