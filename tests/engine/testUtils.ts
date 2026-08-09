import { CARDS } from '../../src/data/cards';
import type { Card, GameState, Player, PropertyColor } from '../../src/types/game';

export function cardById(id: string): Card {
  const card = CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
}

export function makeField(): Record<PropertyColor, Card[]> {
  return {
    PUBLIC_HOUSING: [],
    OLD_TONG_LAU: [],
    ESTATE: [],
    COMMERCIAL_LUXURY: [],
    TRANSPORT: [],
  };
}

export function makePlayer(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return { id, name, hand: [], field: makeField(), bank: [], ...overrides };
}

export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    mode: 'CLASSIC',
    turn: 1,
    activePlayerIndex: 0,
    players: [makePlayer('player-1', 'Alice'), makePlayer('player-2', 'Bob')],
    deck: [],
    discardPile: [],
    activeMacroEvents: [],
    rngSeed: 1,
    phase: 'ACTION',
    actionsPlayedThisTurn: 0,
    ...overrides,
  };
}
