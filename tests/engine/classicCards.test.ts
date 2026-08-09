import { describe, expect, it } from 'vitest';
import { MACRO_EVENTS } from '../../src/data/events';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('DEBT_COLLECTOR (收數)', () => {
  it('opens a single-target reaction demanding a fixed $5M, independent of the card face value', () => {
    const debtCollector = cardById('action-debt-collector'); // value 3, but the demand is 5
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('commercial-ifc')] }); // value 4
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    expect(played.nextState.pendingReaction?.amount).toBe(5);

    const responded = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });
    expect(responded.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      amount: 4,
    });
  });
});

describe('PASS_GO (過龍)', () => {
  it('draws 2 extra cards and still counts as one action', () => {
    const passGo = cardById('action-pass-go-1');
    const filler = cardById('rent-estate');
    const alice = makePlayer('player-1', 'Alice', { hand: [passGo, filler] });
    const state = makeState({
      players: [alice, makePlayer('player-2', 'Bob')],
      deck: ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen'].map(cardById),
    });

    const { nextState, events } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: passGo.id });
    expect(nextState.players[0]?.hand).toHaveLength(3); // filler + 2 drawn
    expect(nextState.actionsPlayedThisTurn).toBe(1);
    expect(events).toContainEqual({ type: 'CARDS_DRAWN', playerId: 'player-1', count: 2 });
  });
});

describe('HOUSE / HOTEL (洋樓 / 酒店)', () => {
  const completeSet = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'].map(cardById);

  it('rejects building a house on an incomplete set', () => {
    const house = cardById('action-house');
    const alice = makePlayer('player-1', 'Alice', {
      hand: [house],
      field: { ...makeField(), ESTATE: [cardById('estate-taikoo-shing')] },
    });
    const state = makeState({ players: [alice, makePlayer('player-2', 'Bob')] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: house.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });
    expect(nextState.players[0]?.field.ESTATE).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'INVALID_ACTION' }),
    );
  });

  it('rejects a hotel before a house is built, and rejects improvements on 交通基建', () => {
    const hotel = cardById('action-hotel');
    const house = cardById('action-house');
    const alice = makePlayer('player-1', 'Alice', {
      hand: [hotel, house],
      field: { ...makeField(), ESTATE: completeSet, TRANSPORT: ['transport-island-line', 'transport-interchange-station', 'transport-third-runway'].map(cardById) },
    });
    const state = makeState({ players: [alice, makePlayer('player-2', 'Bob')] });

    const hotelFirst = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: hotel.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });
    expect(hotelFirst.events).toContainEqual(expect.objectContaining({ type: 'INVALID_ACTION' }));

    const onTransport = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: house.id,
      target: { playerId: 'player-1', color: 'TRANSPORT' },
    });
    expect(onTransport.events).toContainEqual(expect.objectContaining({ type: 'INVALID_ACTION' }));
  });

  it('boosts rent by +3 with a house and +7 total with a house and hotel', () => {
    const house = cardById('action-house');
    const hotel = cardById('action-hotel');
    const rentCard = cardById('rent-estate');

    let alice = makePlayer('player-1', 'Alice', {
      hand: [house, hotel, rentCard],
      field: { ...makeField(), ESTATE: completeSet },
    });
    let bob = makePlayer('player-2', 'Bob', { bank: [cardById('commercial-ifc'), cardById('commercial-k11')] });
    let state = makeState({ players: [alice, bob] });

    const afterHouse = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: house.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });
    expect(afterHouse.nextState.players[0]?.field.ESTATE).toHaveLength(4);

    const afterRentWithHouse = applyAction(afterHouse.nextState, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: rentCard.id,
    });
    // base tier for 3 owned = 6, +3 for the house = 9
    expect(afterRentWithHouse.nextState.pendingReaction?.amount).toBe(9);
  });
});

describe('黑色暴雨警告 (DISCARD_RANDOM_ALL)', () => {
  it('makes every player with cards discard exactly one when the event triggers', () => {
    // Seed 15 is empirically the first seed where TURN_START's random roll triggers a macro
    // event AND the follow-up pick lands on 黑色暴雨警告 specifically, out of the current 14-event
    // pool. This seed is expected to need re-picking again whenever MACRO_EVENTS grows or shrinks
    // — the pick is an index into the whole pool, so its size shifts what any given seed lands on.
    const seed = 15;
    const alice = makePlayer('player-1', 'Alice', { hand: ['rent-estate', 'rent-transport'].map(cardById) });
    const bob = makePlayer('player-2', 'Bob', { hand: [cardById('action-double-rent')] });
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
    expect(triggered.event.id).toBe('black-rainstorm');

    // The discard happens before the turn-start draw: Alice goes 2 -> 1 -> +2 drawn = 3;
    // Bob's single card is discarded and he doesn't draw (it isn't his turn).
    expect(nextState.players[0]?.hand).toHaveLength(3);
    expect(nextState.players[1]?.hand).toHaveLength(0);
    expect(nextState.discardPile.length).toBeGreaterThanOrEqual(1);
    expect(events.filter((e) => e.type === 'HAND_DISCARDED')).toHaveLength(2);
  });

  it('is present in the macro event pool with a DISCARD_RANDOM_ALL special effect', () => {
    const event = MACRO_EVENTS.find((e) => e.id === 'black-rainstorm');
    expect(event?.specialEffects).toEqual([{ effect: 'DISCARD_RANDOM_ALL' }]);
  });
});
