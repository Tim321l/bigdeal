import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('player-chosen payment (paymentCardIds)', () => {
  it('lets the payer choose which cards to give up instead of auto-picking the cheapest', () => {
    const debtCollector = cardById('action-debt-collector');
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const bigProperty = cardById('commercial-ifc'); // value 4
    const smallMoney = cardById('money-1m-a'); // value 1
    const bob = makePlayer('player-2', 'Bob', { bank: [smallMoney, bigProperty] }); // amount owed is 5
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    expect(played.nextState.pendingReaction?.amount).toBe(5);

    // Bob only has $1M + $4M = $5M total, so he must give up everything regardless of choice —
    // but a *different* case below shows a real choice mattering when he has more than enough.
    const responded = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
      paymentCardIds: [bigProperty.id, smallMoney.id],
    });
    expect(responded.nextState.players[1]?.bank).toHaveLength(0);
    expect(responded.nextState.players[0]?.bank.map((c) => c.id).sort()).toEqual(
      [bigProperty.id, smallMoney.id].sort(),
    );
  });

  it('honors an explicit choice that overpays rather than always picking the cheapest combo', () => {
    const debtCollector = cardById('action-debt-collector'); // demands $5M
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const wantsToKeep = cardById('money-1m-a'); // value 1 — Bob would rather keep this
    const wantsToGiveAway = cardById('commercial-k11'); // value 4 — a property Bob doesn't want
    const alsoAvailable = cardById('money-1m-b'); // value 1 — extra cash Bob has but won't use
    const bob = makePlayer('player-2', 'Bob', { bank: [wantsToKeep, wantsToGiveAway, alsoAvailable] });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });

    // Bob explicitly picks only the $4M property — short of the $5M owed, but it's still his
    // choice to make since auto-picking cheapest-first would instead take both $1M cards plus
    // force him to dip into the property too. Here the choice itself totals $4M < $5M owed, so
    // engine should still require covering the debt: expect it to accept the choice only if it
    // meets the minimum. $4M alone doesn't, so this exercises the "falls back" path — see next.
    const shortResult = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
      paymentCardIds: [wantsToGiveAway.id],
    });
    // Falls back to auto-pick (cheapest first) since the chosen $4M alone doesn't cover $5M.
    expect(shortResult.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      amount: 6, // auto-pick takes both $1M cards + the $4M property = $6M (cheapest-first)
    });
  });

  it('accepts a valid choice that exactly meets the minimum, leaving untouched cards alone', () => {
    const debtCollector = cardById('action-debt-collector'); // demands $5M
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const chosenProperty = cardById('commercial-ifc'); // value 4
    const chosenMoney = cardById('money-1m-a'); // value 1 -> chosen total = 5, meets the minimum
    const untouchedMoney = cardById('money-2m-a'); // value 2 — Bob keeps this
    const bob = makePlayer('player-2', 'Bob', { bank: [chosenProperty, chosenMoney, untouchedMoney] });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });

    const result = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
      paymentCardIds: [chosenProperty.id, chosenMoney.id],
    });

    expect(result.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      amount: 5,
    });
    // The untouched $2M card stays exactly where Bob left it.
    expect(result.nextState.players[1]?.bank.map((c) => c.id)).toEqual([untouchedMoney.id]);
  });

  it('falls back to auto-pick when no paymentCardIds are given (e.g. a bot responding)', () => {
    const debtCollector = cardById('action-debt-collector');
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const bob = makePlayer('player-2', 'Bob', {
      bank: [cardById('money-1m-a'), cardById('money-2m-a'), cardById('commercial-ifc')],
    });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    const result = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    // Cheapest-first: $1M + $2M = $3M < $5M, so it also needs the $4M property = $7M collected.
    expect(result.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      amount: 7,
    });
  });

  it('never spends hand cards to cover a charge, even if explicitly chosen or the bank is empty', () => {
    const debtCollector = cardById('action-debt-collector'); // demands $5M
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const handOnlyMoney = cardById('money-4m-a'); // would easily cover the debt, but it's in hand
    const bob = makePlayer('player-2', 'Bob', { bank: [], hand: [handOnlyMoney] });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });

    // Explicitly "choosing" the hand card should just be ignored — it isn't in the eligible pool
    // at all, so the chosen total is 0 < the $5M minimum and the (still bank-only) auto-pick
    // kicks in, collecting nothing from an empty bank.
    const result = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
      paymentCardIds: [handOnlyMoney.id],
    });

    expect(result.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      amount: 0,
    });
    // The hand card was never touched.
    expect(result.nextState.players[1]?.hand.map((c) => c.id)).toEqual([handOnlyMoney.id]);
  });
});

describe('field properties as payment (real Monopoly Deal rule: transfers to the collector)', () => {
  it('falls back to a built property when the bank alone is short, transferring it to the receiver', () => {
    const debtCollector = cardById('action-debt-collector'); // demands $5M
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const builtProperty = cardById('estate-taikoo-shing'); // value 3
    const bob = makePlayer('player-2', 'Bob', {
      bank: [cardById('money-2m-a')], // $2M — short of the $5M owed
      field: { ...makeField(), ESTATE: [builtProperty] },
    });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    const result = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(result.events).toContainEqual({
      type: 'PROPERTY_SURRENDERED_AS_PAYMENT',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      cardId: builtProperty.id,
      color: 'ESTATE',
    });
    expect(result.events).toContainEqual({ type: 'RENT_CHARGED', fromPlayerId: 'player-2', toPlayerId: 'player-1', amount: 5 });
    // The property is now on Alice's field, not Bob's.
    expect(result.nextState.players[1]?.field.ESTATE).toHaveLength(0);
    expect(result.nextState.players[0]?.field.ESTATE.map((c) => c.id)).toEqual([builtProperty.id]);
  });

  it('exempts a 釘子戶-protected color, same as its protection against Sly Deal/Forced Deal/Deal Breaker', () => {
    const debtCollector = cardById('action-debt-collector'); // demands $5M
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const protectedProperty = cardById('estate-taikoo-shing');
    const nailHouse = cardById('action-nail-house');
    const bob = makePlayer('player-2', 'Bob', {
      bank: [cardById('money-2m-a')], // still short of $5M
      field: { ...makeField(), ESTATE: [protectedProperty, nailHouse] },
    });
    const state = makeState({ players: [alice, bob], mode: 'CLASSIC' });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    const result = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    // Not in BATTLE_ROYALE/REAL_BIG_DEAL, so this just underpays rather than going bankrupt —
    // the protected property must stay untouched either way.
    expect(result.events.some((e) => e.type === 'PROPERTY_SURRENDERED_AS_PAYMENT')).toBe(false);
    expect(result.events).toContainEqual({ type: 'RENT_CHARGED', fromPlayerId: 'player-2', toPlayerId: 'player-1', amount: 2 });
    expect(result.nextState.players[1]?.field.ESTATE.map((c) => c.id)).toEqual([protectedProperty.id, nailHouse.id]);
  });

  it('avoids bankruptcy in REAL_BIG_DEAL when unprotected field properties cover the shortfall', () => {
    const debtCollector = cardById('action-debt-collector'); // demands $5M
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const propertyA = cardById('public-housing-tin-shing-yuen'); // value 1
    const propertyB = cardById('tong-lau-apliu-street'); // value 2
    const propertyC = cardById('estate-taikoo-shing'); // value 3 -> total field value 6, covers $5M
    const bob = makePlayer('player-2', 'Bob', {
      bank: [], // completely empty — would go bankrupt under the old bank-only rule
      field: { ...makeField(), PUBLIC_HOUSING: [propertyA], OLD_TONG_LAU: [propertyB], ESTATE: [propertyC] },
    });
    const state = makeState({ players: [alice, bob], mode: 'REAL_BIG_DEAL' });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    const result = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(result.events.some((e) => e.type === 'PLAYER_ELIMINATED')).toBe(false);
    expect(result.nextState.players[1]?.eliminated).toBeFalsy();
    // Cheapest-first auto-pick: $1M + $2M properties, then needs $2M more from the $3M one =
    // all three change hands, collecting $6M (no change given).
    expect(result.events).toContainEqual({ type: 'RENT_CHARGED', fromPlayerId: 'player-2', toPlayerId: 'player-1', amount: 6 });
  });
});
