import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards';
import { MACRO_EVENTS } from '../data/events';
import type { Card, GameState, Player, PropertyColor } from '../types/game';
import { applyAction, initGame } from './stateManager';

function cardById(id: string): Card {
  const card = CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
}

function makeField(): Record<PropertyColor, Card[]> {
  return {
    PUBLIC_HOUSING: [],
    OLD_TONG_LAU: [],
    ESTATE: [],
    COMMERCIAL_LUXURY: [],
    TRANSPORT: [],
  };
}

function makePlayer(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return { id, name, hand: [], field: makeField(), bank: [], ...overrides };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
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

describe('initGame', () => {
  it('is deterministic for a given seed', () => {
    const a = initGame(['Alice', 'Bob'], 42);
    const b = initGame(['Alice', 'Bob'], 42);
    expect(a).toEqual(b);
  });

  it('deals 5 cards to every player and keeps the rest in the deck', () => {
    const state = initGame(['Alice', 'Bob', 'Carol'], 7);
    for (const player of state.players) {
      expect(player.hand).toHaveLength(5);
    }
    expect(state.deck).toHaveLength(CARDS.length - 15);
    expect(state.phase).toBe('TURN_START');
  });

  it('starts every player with an empty bank outside REAL_BIG_DEAL', () => {
    const state = initGame(['Alice', 'Bob'], 42, 'CLASSIC');
    for (const player of state.players) {
      expect(player.bank).toHaveLength(0);
    }
  });

  it('gives REAL_BIG_DEAL players $8M starting cash, matching the board game rather than an empty card-game start', () => {
    const state = initGame(['Alice', 'Bob'], 42, 'REAL_BIG_DEAL');
    for (const player of state.players) {
      expect(player.bank.reduce((sum, c) => sum + c.value, 0)).toBe(8);
    }
  });

  it('splits REAL_BIG_DEAL starting cash into 8 separate $1M bills instead of one lump $8M card', () => {
    // chargePlayer never gives change, so a single $8M bill would force overpaying (and losing)
    // the whole thing against even a $1M charge — $1M bills let any amount 1-8 be paid exactly.
    const state = initGame(['Alice', 'Bob'], 42, 'REAL_BIG_DEAL');
    for (const player of state.players) {
      expect(player.bank).toHaveLength(8);
      expect(player.bank.every((c) => c.value === 1)).toBe(true);
    }
  });
});

describe('DRAW', () => {
  it('rejects a draw outside TURN_START or from a non-active player', () => {
    const actionPhase = makeState({ phase: 'ACTION' });
    expect(applyAction(actionPhase, { type: 'DRAW', playerId: 'player-1' }).events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'Cards can only be drawn at the start of a turn.',
    });

    const wrongPlayer = makeState({ phase: 'TURN_START' });
    expect(applyAction(wrongPlayer, { type: 'DRAW', playerId: 'player-2' }).events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'Only the active player may draw.',
    });
  });

  it('draws 2 cards and moves to ACTION when the seed does not trigger a macro event', () => {
    const deck = CARDS.slice(0, 10);
    const alice = makePlayer('player-1', 'Alice', { hand: [cardById('action-double-rent')] });
    const state = makeState({ phase: 'TURN_START', deck, rngSeed: 1, players: [alice, makePlayer('player-2', 'Bob')] });

    const { nextState, events } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });
    expect(nextState.phase).toBe('ACTION');
    expect(nextState.players[0]?.hand).toHaveLength(3);
    expect(events).toContainEqual({ type: 'CARDS_DRAWN', playerId: 'player-1', count: 2 });
  });

  it('draws 5 cards instead of 2 when the hand is empty', () => {
    const deck = CARDS.slice(0, 10);
    const state = makeState({ phase: 'TURN_START', deck, rngSeed: 1 });

    const { nextState } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });
    expect(nextState.players[0]?.hand).toHaveLength(5);
  });

  it('is deterministic in whether/which macro event triggers for a given seed', () => {
    const deck = CARDS.slice(0, 10);
    const state = makeState({ phase: 'TURN_START', deck, rngSeed: 777 });

    const a = applyAction(state, { type: 'DRAW', playerId: 'player-1' });
    const b = applyAction(state, { type: 'DRAW', playerId: 'player-1' });
    expect(a.nextState.activeMacroEvents).toEqual(b.nextState.activeMacroEvents);
    expect(a.events).toEqual(b.events);
  });
});

describe('PLAY_CARD', () => {
  it('builds a property into its matching color field and consumes an action', () => {
    const card = cardById('estate-taikoo-shing');
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand: [card] }), makePlayer('player-2', 'Bob')],
    });

    const { nextState, events } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: card.id });
    expect(nextState.players[0]?.field.ESTATE.map((c) => c.id)).toEqual([card.id]);
    expect(nextState.actionsPlayedThisTurn).toBe(1);
    expect(events).toContainEqual({ type: 'PROPERTY_BUILT', playerId: 'player-1', cardId: card.id, color: 'ESTATE' });
  });

  it('banks a card for its face value when asBank is set', () => {
    const card = cardById('action-double-rent');
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand: [card] }), makePlayer('player-2', 'Bob')],
    });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: card.id,
      asBank: true,
    });
    expect(nextState.players[0]?.bank.map((c) => c.id)).toEqual([card.id]);
    expect(events).toContainEqual({ type: 'CARD_BANKED', playerId: 'player-1', cardId: card.id, amount: card.value });
  });

  it('rejects a play beyond the per-turn action limit', () => {
    const fillerIds = ['action-double-rent', 'action-just-say-no', 'rent-transport', 'rent-estate'];
    const filler = fillerIds.map(cardById);
    let state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand: filler }), makePlayer('player-2', 'Bob')],
    });

    for (let i = 0; i < 3; i++) {
      const card = filler[i]!;
      state = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: card.id, asBank: true }).nextState;
    }
    expect(state.actionsPlayedThisTurn).toBe(3);

    const last = filler[3]!;
    const { events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: last.id,
      asBank: true,
    });
    expect(events).toContainEqual({ type: 'INVALID_ACTION', reason: 'No actions remaining this turn.' });
  });

  it('declares a winner once a 3rd complete property set is built', () => {
    const phSet = ['public-housing-tin-shing-yuen', 'public-housing-yau-oi-estate', 'public-housing-ngau-tau-kok-lower-estate'].map(
      cardById,
    );
    const tlSet = ['tong-lau-apliu-street', 'tong-lau-ladies-market', 'tong-lau-nga-tsin-wai-road'].map(cardById);
    const esPartial = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen'].map(cardById);
    const esFinal = cardById('estate-city-one');

    const field = makeField();
    field.PUBLIC_HOUSING = phSet;
    field.OLD_TONG_LAU = tlSet;
    field.ESTATE = esPartial;

    const state = makeState({
      players: [
        makePlayer('player-1', 'Alice', { field, hand: [esFinal] }),
        makePlayer('player-2', 'Bob'),
      ],
    });

    const { nextState, events } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: esFinal.id });
    expect(nextState.winnerId).toBe('player-1');
    expect(nextState.phase).toBe('GAME_OVER');
    expect(events).toContainEqual({ type: 'GAME_WON', playerId: 'player-1' });
  });
});

describe('RENT cards and the reaction window', () => {
  it('opens a reaction window, then charges the target once they ACCEPT', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing'); // rentTiers [2,4,6]; owning 1 => base rent 2
    const bobBankCard = cardById('estate-mei-foo-sun-chuen'); // value 3

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [bobBankCard] });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    expect(played.nextState.phase).toBe('REACTION_WINDOW');
    expect(played.nextState.pendingReaction?.amount).toBe(2);
    expect(played.events).toContainEqual({ type: 'REACTION_REQUESTED', playerId: 'player-2', card: rentCard });

    const responded = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });
    expect(responded.nextState.phase).toBe('ACTION');
    expect(responded.nextState.players[1]?.bank).toHaveLength(0);
    expect(responded.nextState.players[0]?.bank.map((c) => c.id)).toEqual([bobBankCard.id]);
    expect(responded.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      amount: 3,
    });
  });

  it('applies active macro-event RENT modifiers end-to-end', () => {
    const rentCard = cardById('rent-transport');
    const propCard = cardById('transport-island-line'); // rentTiers [1,2,4]; owning 1 => base rent 1
    const rateHike = MACRO_EVENTS.find((e) => e.id === 'rate-hike');
    if (!rateHike) throw new Error('rate-hike event missing from data');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      field: { ...makeField(), TRANSPORT: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('estate-mei-foo-sun-chuen')] });
    const state = makeState({ players: [alice, bob], activeMacroEvents: [rateHike] });

    const { nextState } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    expect(nextState.pendingReaction?.amount).toBe(0); // floor(1 * 0.5) = 0
  });

  it('lets the target cancel a Sly Deal by playing Just Say No', () => {
    const slyDeal = cardById('action-sly-deal');
    const justSayNo = cardById('action-just-say-no');
    const targetProperty = cardById('transport-island-line');

    const alice = makePlayer('player-1', 'Alice', { hand: [slyDeal] });
    const bob = makePlayer('player-2', 'Bob', {
      hand: [justSayNo],
      field: { ...makeField(), TRANSPORT: [targetProperty] },
    });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: slyDeal.id,
      target: { playerId: 'player-2', cardId: targetProperty.id },
    });
    expect(played.nextState.phase).toBe('REACTION_WINDOW');

    const blocked = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
    });
    // Alice has no 封區 of her own to counter with, so she must accept Bob's cancellation
    // (chained Just Say No is covered separately in tests/engine/reactions.test.ts).
    expect(blocked.nextState.phase).toBe('REACTION_WINDOW');
    expect(blocked.nextState.pendingReaction?.currentResponderId).toBe('player-1');
    const responded = applyAction(blocked.nextState, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });

    expect(responded.nextState.phase).toBe('ACTION');
    expect(responded.nextState.players[1]?.field.TRANSPORT.map((c) => c.id)).toEqual([targetProperty.id]);
    expect(responded.nextState.players[0]?.field.TRANSPORT).toHaveLength(0);
    expect(blocked.events).toContainEqual({
      type: 'REACTION_RESOLVED',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
    });
  });
});

describe('action cards', () => {
  it('DEAL_BREAKER steals a complete set once accepted', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const set = ['public-housing-tin-shing-yuen', 'public-housing-yau-oi-estate', 'public-housing-ngau-tau-kok-lower-estate'].map(
      cardById,
    );

    const alice = makePlayer('player-1', 'Alice', { hand: [dealBreaker] });
    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), PUBLIC_HOUSING: set } });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });
    expect(played.nextState.phase).toBe('REACTION_WINDOW');

    const responded = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });
    expect(responded.nextState.players[0]?.field.PUBLIC_HOUSING).toHaveLength(3);
    expect(responded.nextState.players[1]?.field.PUBLIC_HOUSING).toHaveLength(0);
  });

  it('rejects DEAL_BREAKER against an incomplete set', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const partial = ['public-housing-tin-shing-yuen'].map(cardById);

    const alice = makePlayer('player-1', 'Alice', { hand: [dealBreaker] });
    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), PUBLIC_HOUSING: partial } });
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });
    expect(nextState.phase).toBe('ACTION');
    expect(nextState.players[0]?.hand.map((c) => c.id)).toEqual([dealBreaker.id]);
    expect(events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'Deal Breaker requires targeting a complete, unprotected property set.',
    });
  });

  it('FORCED_DEAL swaps one property for another once accepted', () => {
    const forcedDeal = cardById('action-forced-deal');
    const aliceCard = cardById('public-housing-tin-shing-yuen');
    const bobCard = cardById('tong-lau-apliu-street');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [forcedDeal],
      field: { ...makeField(), PUBLIC_HOUSING: [aliceCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), OLD_TONG_LAU: [bobCard] } });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: forcedDeal.id,
      target: { playerId: 'player-2', cardId: bobCard.id, offeredCardId: aliceCard.id },
    });
    const responded = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(responded.nextState.players[0]?.field.OLD_TONG_LAU.map((c) => c.id)).toEqual([bobCard.id]);
    expect(responded.nextState.players[1]?.field.PUBLIC_HOUSING.map((c) => c.id)).toEqual([aliceCard.id]);
  });

  it('BIRTHDAY collects its face value from every other player', () => {
    const birthday = cardById('action-birthday');
    const alice = makePlayer('player-1', 'Alice', { hand: [birthday] });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('estate-mei-foo-sun-chuen')] });
    const carol = makePlayer('player-3', 'Carol', { bank: [cardById('commercial-k11')] });
    const state = makeState({ players: [alice, bob, carol] });

    const played = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: birthday.id });
    expect(played.nextState.pendingReaction?.targetQueue).toEqual(['player-2', 'player-3']);

    const afterFirst = applyAction(played.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });
    expect(afterFirst.nextState.phase).toBe('REACTION_WINDOW');

    const afterSecond = applyAction(afterFirst.nextState, {
      type: 'RESPOND',
      playerId: 'player-3',
      response: 'ACCEPT',
    });
    expect(afterSecond.nextState.phase).toBe('ACTION');
    expect(afterSecond.nextState.players[0]?.bank).toHaveLength(2);
  });

  it('DOUBLE_RENT doubles the next rent charge and then resets', () => {
    const doubleRent = cardById('action-double-rent');
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing'); // base rent 2

    const alice = makePlayer('player-1', 'Alice', {
      hand: [doubleRent, rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('commercial-ifc')] }); // value 4
    const state = makeState({ players: [alice, bob] });

    const afterDouble = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: doubleRent.id });
    expect(afterDouble.nextState.pendingRentMultiplier).toBe(2);

    const afterRent = applyAction(afterDouble.nextState, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: rentCard.id,
    });
    expect(afterRent.nextState.pendingReaction?.amount).toBe(4);
    expect(afterRent.nextState.pendingRentMultiplier).toBeUndefined();
  });
});

describe('END_TURN', () => {
  it('discards down to 7 cards and advances to the next player', () => {
    const hand = CARDS.slice(0, 9);
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand }), makePlayer('player-2', 'Bob')],
    });

    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.players[0]?.hand).toHaveLength(7);
    expect(nextState.discardPile).toHaveLength(2);
    expect(nextState.activePlayerIndex).toBe(1);
    expect(nextState.turn).toBe(2);
    expect(nextState.phase).toBe('TURN_START');
    expect(events).toContainEqual({ type: 'HAND_DISCARDED', playerId: 'player-1', count: 2 });
  });

  it('rejects ending the turn outside the ACTION phase', () => {
    const state = makeState({ phase: 'TURN_START' });
    const { events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(events).toContainEqual({ type: 'INVALID_ACTION', reason: 'The turn cannot be ended right now.' });
  });
});
