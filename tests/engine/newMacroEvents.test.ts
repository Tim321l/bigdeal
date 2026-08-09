import { describe, expect, it } from 'vitest';
import { MACRO_EVENTS } from '../../src/data/events';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

function event(id: string) {
  const found = MACRO_EVENTS.find((e) => e.id === id);
  if (!found) throw new Error(`unknown macro event ${id}`);
  return found;
}

describe('垃圾徵費實施 (HAND_FEE)', () => {
  it('charges $1M/card over the lowered 5-card limit from the bank, keeping the card', () => {
    const money = (n: number) => cardById(`money-${n}m-a`);
    const alice = makePlayer('player-1', 'Alice', {
      hand: [cardById('rent-estate'), cardById('rent-transport'), cardById('rent-old-tong-lau'), money(1), money(2), money(3), money(4)], // 7 cards, 2 over the limit of 5
      // 4 distinct $1M cards (not the same id repeated — the fee payment filters by card id, so
      // reusing one id here would make paying one fee remove every "copy" at once).
      bank: ['money-1m-a', 'money-1m-b', 'money-1m-c', 'money-1m-d'].map(cardById), // enough to cover 2 x $1M fees
    });
    const state = makeState({
      players: [alice, makePlayer('player-2', 'Bob')],
      activeMacroEvents: [event('garbage-levy')],
    });

    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });

    expect(events).toContainEqual({ type: 'HAND_FEE_SETTLED', playerId: 'player-1', finedCount: 2, discardedCount: 0, amountPaid: 2 });
    // All 7 hand cards survive (the fee was paid, not the card discarded).
    expect(nextState.players[0]?.hand).toHaveLength(7);
    // 2 x $1M fees came out of the bank.
    expect(nextState.players[0]?.bank).toHaveLength(2);
  });

  it('discards the excess card instead when the bank cannot cover its fee', () => {
    const money = (n: number) => cardById(`money-${n}m-a`);
    const alice = makePlayer('player-1', 'Alice', {
      hand: [cardById('rent-estate'), cardById('rent-transport'), cardById('rent-old-tong-lau'), money(1), money(2), money(3)], // 6 cards, 1 over the limit
      bank: [], // nothing to pay the fee with
    });
    const state = makeState({
      players: [alice, makePlayer('player-2', 'Bob')],
      activeMacroEvents: [event('garbage-levy')],
    });

    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });

    expect(events).toContainEqual({ type: 'HAND_FEE_SETTLED', playerId: 'player-1', finedCount: 0, discardedCount: 1, amountPaid: 0 });
    expect(nextState.players[0]?.hand).toHaveLength(5);
  });

  it('falls back to the plain free discard-down-to-7 when the event is not active', () => {
    const money = (n: number) => cardById(`money-${n}m-a`);
    const alice = makePlayer('player-1', 'Alice', {
      hand: [
        cardById('rent-estate'), cardById('rent-transport'), cardById('rent-old-tong-lau'), cardById('rent-public-housing'),
        money(1), money(2), money(3), money(4), // 8 cards, 1 over the normal 7-card limit
      ],
    });
    const state = makeState({ players: [alice, makePlayer('player-2', 'Bob')] });

    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });

    expect(events).toContainEqual({ type: 'HAND_DISCARDED', playerId: 'player-1', count: 1 });
    expect(nextState.players[0]?.hand).toHaveLength(7);
  });
});

describe('世紀特大暴雨(黑雨停工) (DISABLE_IMPROVEMENTS)', () => {
  it('blocks playing a HOUSE card while active', () => {
    const houseCard = cardById('action-house');
    const alice = makePlayer('player-1', 'Alice', {
      hand: [houseCard],
      field: { ...makeField(), ESTATE: [cardById('estate-taikoo-shing'), cardById('estate-mei-foo-sun-chuen'), cardById('estate-city-one')] },
    });
    const state = makeState({
      players: [alice, makePlayer('player-2', 'Bob')],
      activeMacroEvents: [event('black-rain-construction-halt')],
    });

    const { events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: houseCard.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });

    expect(events).toContainEqual({ type: 'INVALID_ACTION', reason: 'Houses cannot be built while 世紀特大暴雨 disables improvements.' });
  });

  it('zeroes an already-attached House/Hotel bonus while active, restored once it expires', () => {
    const alice = makePlayer('player-1', 'Alice', {
      hand: [cardById('rent-estate')],
      field: {
        ...makeField(),
        ESTATE: [
          cardById('estate-taikoo-shing'),
          cardById('estate-mei-foo-sun-chuen'),
          cardById('estate-city-one'),
          cardById('action-house'),
        ],
      },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-4m-a'), cardById('money-4m-a')] });

    const withEvent = makeState({
      players: [alice, bob],
      activeMacroEvents: [event('black-rain-construction-halt')],
    });
    const played = applyAction(withEvent, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: 'rent-estate',
      target: { playerId: 'player-2' },
    });
    // 3-tier rent for 3 ESTATE properties, no House bonus while disabled.
    expect(played.nextState.pendingReaction?.amount).toBe(cardById('estate-taikoo-shing').rentTiers?.[2]);

    const withoutEvent = makeState({ players: [alice, bob] });
    const playedNoEvent = applyAction(withoutEvent, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: 'rent-estate',
      target: { playerId: 'player-2' },
    });
    const baseTier = cardById('estate-taikoo-shing').rentTiers?.[2] ?? 0;
    expect(playedNoEvent.nextState.pendingReaction?.amount).toBeGreaterThan(baseTier);
  });
});

describe('一手空置稅 (SINGLE_SET_TAX)', () => {
  it('charges the player with the most single-property incomplete colors when the event triggers', () => {
    // Seed 45 is empirically a seed where TURN_START's roll triggers a macro event and the pick
    // lands on 一手空置稅 specifically, out of the current 20-event pool — same re-picking caveat
    // as every other seed-dependent macro-event test in this suite.
    const seed = 45;
    const alice = makePlayer('player-1', 'Alice', {
      hand: [cardById('rent-estate')],
      bank: [cardById('money-3m-a')], // exact change for the $3M tax
      field: { ...makeField(), PUBLIC_HOUSING: [cardById('public-housing-tin-shing-yuen')] }, // 1 lone incomplete color
    });
    const bob = makePlayer('player-2', 'Bob'); // no properties at all — nothing to tax
    const state = makeState({
      players: [alice, bob],
      phase: 'TURN_START',
      rngSeed: seed,
      deck: [cardById('rent-commercial-luxury'), cardById('rent-public-housing')],
    });

    const { nextState, events } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });

    const triggered = events.find((e) => e.type === 'MACRO_EVENT_TRIGGERED');
    expect(triggered).toBeDefined();
    if (triggered?.type !== 'MACRO_EVENT_TRIGGERED') throw new Error('expected a trigger event');
    expect(triggered.event.id).toBe('vacant-unit-tax');

    expect(events).toContainEqual({ type: 'TAX_CHARGED', playerId: 'player-1', amount: 3 });
    expect(nextState.players[0]?.bank).toHaveLength(0);
  });

  it('is a no-op when nobody owns any single-property incomplete color', () => {
    const seed = 45;
    const state = makeState({
      players: [makePlayer('player-1', 'Alice'), makePlayer('player-2', 'Bob')],
      phase: 'TURN_START',
      rngSeed: seed,
      deck: [cardById('rent-commercial-luxury'), cardById('rent-public-housing')],
    });

    const { events } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });

    expect(events.some((e) => e.type === 'TAX_CHARGED')).toBe(false);
  });
});

describe('消費券派發 (DRAW_ALL + ACTION_LIMIT)', () => {
  it('draws 2 extra cards for every player and grants one extra action this turn', () => {
    // Seed 9 is empirically a seed where TURN_START's roll triggers 消費券派發 out of the current
    // 20-event pool.
    const seed = 9;
    const alice = makePlayer('player-1', 'Alice', { hand: [cardById('rent-estate')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({
      players: [alice, bob],
      phase: 'TURN_START',
      rngSeed: seed,
      deck: [
        cardById('rent-commercial-luxury'),
        cardById('rent-public-housing'),
        cardById('money-1m-a'),
        cardById('money-1m-b'),
        cardById('money-2m-a'),
        cardById('money-2m-b'),
      ],
    });

    const { nextState, events } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });

    const triggered = events.find((e) => e.type === 'MACRO_EVENT_TRIGGERED');
    expect(triggered).toBeDefined();
    if (triggered?.type !== 'MACRO_EVENT_TRIGGERED') throw new Error('expected a trigger event');
    expect(triggered.event.id).toBe('consumption-voucher');

    // Both players get 2 extra cards from the event, on top of Alice's normal turn-start draw.
    expect(events.filter((e) => e.type === 'CARDS_DRAWN' && e.playerId === 'player-2')).toHaveLength(1);
    expect(nextState.players[1]?.hand).toHaveLength(2);
    expect(nextState.players[0]?.hand.length).toBeGreaterThanOrEqual(1 + 2); // original card + at least the 2 event cards
  });
});
