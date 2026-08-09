import { describe, expect, it } from 'vitest';
import type { Card, GameState, PropertyColor } from '../types/game';
import { sanitizeStateFor } from './sanitize';

const emptyField = (): Record<PropertyColor, Card[]> => ({
  PUBLIC_HOUSING: [],
  OLD_TONG_LAU: [],
  ESTATE: [],
  COMMERCIAL_LUXURY: [],
  TRANSPORT: [],
});

const card = (id: string): Card => ({ id, name: id, type: 'MONEY', value: 1 });

function makeState(): GameState {
  return {
    mode: 'CLASSIC',
    turn: 3,
    activePlayerIndex: 0,
    players: [
      { id: 'player-1', name: 'Alice', hand: [card('a1'), card('a2')], field: emptyField(), bank: [card('ab1')] },
      { id: 'player-2', name: 'Bob', hand: [card('b1'), card('b2'), card('b3')], field: emptyField(), bank: [] },
    ],
    deck: [card('d1'), card('d2'), card('d3')],
    discardPile: [card('x1')],
    activeMacroEvents: [],
    rngSeed: 123456789,
    phase: 'ACTION',
    actionsPlayedThisTurn: 1,
  };
}

describe('sanitizeStateFor', () => {
  it('reveals the viewer\'s own hand but only a count for everyone else', () => {
    const sanitized = sanitizeStateFor(makeState(), 'player-1');
    const self = sanitized.players.find((p) => p.id === 'player-1')!;
    const other = sanitized.players.find((p) => p.id === 'player-2')!;

    expect(self.hand?.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(self.handCount).toBe(2);

    expect(other.hand).toBeUndefined();
    expect('hand' in other).toBe(false);
    expect(other.handCount).toBe(3);
  });

  it('never leaks deck contents, only its size', () => {
    const sanitized = sanitizeStateFor(makeState(), 'player-1');
    expect(sanitized.deckCount).toBe(3);
    expect(JSON.stringify(sanitized)).not.toContain('"d1"');
    expect('deck' in sanitized).toBe(false);
  });

  it('never includes rngSeed, which would let a client predict future draws', () => {
    const sanitized = sanitizeStateFor(makeState(), 'player-1');
    expect('rngSeed' in sanitized).toBe(false);
    expect(JSON.stringify(sanitized)).not.toContain('123456789');
  });

  it('passes through public information unchanged (field, bank, discard pile)', () => {
    const state = makeState();
    const sanitized = sanitizeStateFor(state, 'player-2');
    expect(sanitized.discardPile).toEqual(state.discardPile);
    expect(sanitized.players.find((p) => p.id === 'player-1')?.bank).toEqual(state.players[0]?.bank);
  });

  it('omits optional fields entirely when unset, rather than sending them as null/undefined', () => {
    const sanitized = sanitizeStateFor(makeState(), 'player-1');
    expect('pendingReaction' in sanitized).toBe(false);
    expect('pendingRentMultiplier' in sanitized).toBe(false);
    expect('winnerId' in sanitized).toBe(false);
  });

  it('stamps the requested viewer id', () => {
    const sanitized = sanitizeStateFor(makeState(), 'player-2');
    expect(sanitized.viewerPlayerId).toBe('player-2');
  });
});
