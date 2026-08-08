import { describe, expect, it } from 'vitest';
import { calculateEffectiveRent } from '../../src/engine/modifierPipeline';
import { applyAction } from '../../src/engine/stateManager';
import type { MacroEvent } from '../../src/types/game';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

const rateHike: MacroEvent = {
  id: 'rate-hike',
  name: '突發加息',
  description: '',
  durationTurns: 3,
  modifiers: [{ target: 'RENT', operator: 'MULTIPLY', value: 0.5 }],
};

describe('rent stacking through the full engine', () => {
  it('Base Rent $3M * Double Rent card * Macro 加息 (x0.5) = $3M', () => {
    const doubleRent = cardById('action-double-rent');
    const rentCard = cardById('rent-commercial-luxury');
    const propCard = cardById('commercial-ifc'); // rentTiers [3, 6, 9]; owning 1 => base rent 3

    const alice = makePlayer('player-1', 'Alice', {
      hand: [doubleRent, rentCard],
      field: { ...makeField(), COMMERCIAL_LUXURY: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', {
      bank: [cardById('commercial-k11'), cardById('commercial-sze-fan-road')],
    });
    const state = makeState({ players: [alice, bob], activeMacroEvents: [rateHike] });

    const afterDouble = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: doubleRent.id });
    expect(afterDouble.nextState.pendingRentMultiplier).toBe(2);

    const afterRent = applyAction(afterDouble.nextState, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: rentCard.id,
    });

    expect(afterRent.nextState.pendingReaction?.amount).toBe(3);
  });

  it('applies the Double Rent card multiplier before macro RENT modifiers — order matters for non-commutative combos', () => {
    const doubleRent = cardById('action-double-rent');
    const rentCard = cardById('rent-public-housing');
    const propCard = cardById('public-housing-tin-shing-yuen'); // rentTiers [1, 2, 4]; owning 1 => base rent 1

    const flatBonus: MacroEvent = {
      id: 'test-rent-bonus',
      name: 'Test Rent Bonus',
      description: '',
      durationTurns: 1,
      modifiers: [{ target: 'RENT', operator: 'ADD', value: 1 }],
    };

    const alice = makePlayer('player-1', 'Alice', {
      hand: [doubleRent, rentCard],
      field: { ...makeField(), PUBLIC_HOUSING: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('commercial-k11')] });
    const state = makeState({ players: [alice, bob], activeMacroEvents: [flatBonus] });

    const afterDouble = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: doubleRent.id });
    const afterRent = applyAction(afterDouble.nextState, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: rentCard.id,
    });

    // (1 * 2) + 1 = 3 — not (1 + 1) * 2 = 4
    expect(afterRent.nextState.pendingReaction?.amount).toBe(3);
  });

  it('resets an unused Double Rent multiplier at END_TURN instead of leaking into the next turn', () => {
    const doubleRent = cardById('action-double-rent');
    const alice = makePlayer('player-1', 'Alice', { hand: [doubleRent] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const afterDouble = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: doubleRent.id });
    expect(afterDouble.nextState.pendingRentMultiplier).toBe(2);

    const afterEnd = applyAction(afterDouble.nextState, { type: 'END_TURN', playerId: 'player-1' });
    expect(afterEnd.nextState.pendingRentMultiplier).toBeUndefined();
  });

  it('keeps rent at 0 under 賣地流標 even with Double Rent, for an incomplete set', () => {
    const doubleRent = cardById('action-double-rent');
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing'); // only 1 of 3 — incomplete set

    const landAuctionFailed: MacroEvent = {
      id: 'land-auction-failed',
      name: '賣地流標',
      description: '',
      durationTurns: 4,
      modifiers: [],
      specialEffects: [{ effect: 'DISABLE_INCOMPLETE_SET_RENT' }],
    };

    const alice = makePlayer('player-1', 'Alice', {
      hand: [doubleRent, rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('commercial-k11')] });
    const state = makeState({ players: [alice, bob], activeMacroEvents: [landAuctionFailed] });

    const afterDouble = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: doubleRent.id });
    const afterRent = applyAction(afterDouble.nextState, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: rentCard.id,
    });

    expect(afterRent.nextState.pendingReaction?.amount).toBe(0);
  });

  it('folds multiple simultaneous RENT modifiers in array order', () => {
    const events: MacroEvent[] = [
      { id: 'e1', name: '', description: '', durationTurns: 1, modifiers: [{ target: 'RENT', operator: 'ADD', value: 2 }] },
      { id: 'e2', name: '', description: '', durationTurns: 1, modifiers: [{ target: 'RENT', operator: 'MULTIPLY', value: 3 }] },
    ];
    const property = cardById('estate-taikoo-shing');
    // (5 + 2) * 3 = 21
    expect(calculateEffectiveRent(5, [property], events)).toBe(21);
  });
});
