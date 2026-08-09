import { describe, expect, it } from 'vitest';
import { decideBotAction } from '../../src/engine/bot';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('釘子戶 (NAIL_HOUSE)', () => {
  it('attaches to one of your own colors you already own a property in', () => {
    const nailHouse = cardById('action-nail-house');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [nailHouse],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: nailHouse.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });

    expect(nextState.players[0]?.field.ESTATE).toContainEqual(nailHouse);
    expect(events).toContainEqual({ type: 'PROPERTY_PROTECTED', playerId: 'player-1', color: 'ESTATE' });
  });

  it('rejects targeting a color you own no property in', () => {
    const nailHouse = cardById('action-nail-house');
    const alice = makePlayer('player-1', 'Alice', { hand: [nailHouse] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: nailHouse.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });

    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(nailHouse);
  });

  it('blocks Sly Deal, Forced Deal, and Deal Breaker from targeting a protected color', () => {
    const propCard = cardById('estate-taikoo-shing');
    const propCard2 = cardById('estate-mei-foo-sun-chuen');
    const propCard3 = cardById('estate-city-one');
    const nailHouse = cardById('action-nail-house');
    const slyDeal = cardById('action-sly-deal');
    const forcedDeal = cardById('action-forced-deal');
    const dealBreaker = cardById('action-deal-breaker');
    const myOffered = cardById('public-housing-tin-shing-yuen');

    const bob = makePlayer('player-2', 'Bob', {
      field: { ...makeField(), ESTATE: [propCard, propCard2, propCard3, nailHouse] },
    });
    const alice = makePlayer('player-1', 'Alice', {
      hand: [slyDeal, forcedDeal, dealBreaker],
      field: { ...makeField(), PUBLIC_HOUSING: [myOffered] },
    });
    const state = makeState({ players: [alice, bob] });

    const slyResult = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: slyDeal.id,
      target: { playerId: 'player-2', cardId: propCard.id },
    });
    expect(slyResult.events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);

    const forcedResult = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: forcedDeal.id,
      target: { playerId: 'player-2', cardId: propCard.id, offeredCardId: myOffered.id },
    });
    expect(forcedResult.events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);

    const breakerResult = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'ESTATE' },
    });
    expect(breakerResult.events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });

  it('blocks 凶宅傳聞 but does NOT block 圍標天價維修', () => {
    const propCard = cardById('estate-taikoo-shing');
    const nailHouse = cardById('action-nail-house');
    const house = cardById('action-house');
    const haunted = cardById('action-haunted-rumor');
    const renovation = cardById('action-renovation-scam');

    const bob = makePlayer('player-2', 'Bob', {
      field: {
        ...makeField(),
        ESTATE: [propCard, cardById('estate-mei-foo-sun-chuen'), cardById('estate-city-one'), nailHouse, house],
      },
    });
    const alice = makePlayer('player-1', 'Alice', { hand: [haunted, renovation] });
    const state = makeState({ players: [alice, bob] });

    const hauntedResult = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: haunted.id,
      target: { playerId: 'player-2', cardId: propCard.id },
    });
    expect(hauntedResult.events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);

    const renovationResult = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: renovation.id,
      target: { playerId: 'player-2', color: 'ESTATE' },
    });
    expect(renovationResult.nextState.phase).toBe('REACTION_WINDOW');
  });
});

describe('炒家摸頂 (MARKET_TOP)', () => {
  it('cannot be played directly as a turn action', () => {
    const marketTop = cardById('action-market-top');
    const alice = makePlayer('player-1', 'Alice', { hand: [marketTop] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { events, nextState } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: marketTop.id });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(marketTop);
  });

  it('reverses a RENT charge — the demander pays the target instead', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');
    const marketTop = cardById('action-market-top');
    const sourceMoney = cardById('money-2m-a');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      bank: [sourceMoney],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { hand: [marketTop] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    expect(afterPlay.nextState.pendingReaction?.amount).toBe(2);

    const afterCounter = applyAction(afterPlay.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'COUNTER',
    });

    expect(afterCounter.events).toContainEqual({
      type: 'RENT_CHARGED',
      fromPlayerId: 'player-1',
      toPlayerId: 'player-2',
      amount: 2,
    });
    expect(afterCounter.nextState.players[1]?.hand).not.toContainEqual(marketTop);
    expect(afterCounter.nextState.players[0]?.bank).not.toContainEqual(sourceMoney);
  });

  it('rejects countering without holding a 炒家摸頂 card', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', { hand: [rentCard], field: { ...makeField(), ESTATE: [propCard] } });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    const { events } = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'COUNTER' });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });

  it('rejects countering a non-money-demand action like Sly Deal', () => {
    const slyDeal = cardById('action-sly-deal');
    const propCard = cardById('estate-taikoo-shing');
    const marketTop = cardById('action-market-top');

    const alice = makePlayer('player-1', 'Alice', { hand: [slyDeal] });
    const bob = makePlayer('player-2', 'Bob', {
      hand: [marketTop],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: slyDeal.id,
      target: { playerId: 'player-2', cardId: propCard.id },
    });
    const { events } = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'COUNTER' });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });
});

describe('圍標天價維修 (RENOVATION_SCAM)', () => {
  it('strips House and Hotel from a target set to the discard pile', () => {
    const propCard = cardById('estate-taikoo-shing');
    const house = cardById('action-house');
    const hotel = cardById('action-hotel');
    const renovation = cardById('action-renovation-scam');

    const bob = makePlayer('player-2', 'Bob', {
      field: {
        ...makeField(),
        ESTATE: [propCard, cardById('estate-mei-foo-sun-chuen'), cardById('estate-city-one'), house, hotel],
      },
    });
    const alice = makePlayer('player-1', 'Alice', { hand: [renovation] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: renovation.id,
      target: { playerId: 'player-2', color: 'ESTATE' },
    });
    const afterAccept = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    const remaining = afterAccept.nextState.players[1]?.field.ESTATE ?? [];
    expect(remaining.some((c) => c.actionType === 'HOUSE')).toBe(false);
    expect(remaining.some((c) => c.actionType === 'HOTEL')).toBe(false);
    expect(remaining.some((c) => c.type === 'PROPERTY')).toBe(true);
    expect(afterAccept.nextState.discardPile).toContainEqual(house);
    expect(afterAccept.nextState.discardPile).toContainEqual(hotel);
    expect(afterAccept.events).toContainEqual({
      type: 'IMPROVEMENT_STRIPPED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      color: 'ESTATE',
    });
  });

  it('rejects targeting a set with no House or Hotel', () => {
    const propCard = cardById('estate-taikoo-shing');
    const renovation = cardById('action-renovation-scam');

    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), ESTATE: [propCard] } });
    const alice = makePlayer('player-1', 'Alice', { hand: [renovation] });
    const state = makeState({ players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: renovation.id,
      target: { playerId: 'player-2', color: 'ESTATE' },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(renovation);
  });
});

describe('凶宅傳聞 (HAUNTED_RUMOR)', () => {
  it('discards a chosen property card, even from a completed set', () => {
    const haunted = cardById('action-haunted-rumor');
    const allThree = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'].map(cardById);

    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), ESTATE: allThree } });
    const alice = makePlayer('player-1', 'Alice', { hand: [haunted] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: haunted.id,
      target: { playerId: 'player-2', cardId: allThree[0]!.id },
    });
    expect(afterPlay.nextState.phase).toBe('REACTION_WINDOW');

    const afterAccept = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(afterAccept.nextState.players[1]?.field.ESTATE).toHaveLength(2);
    expect(afterAccept.nextState.discardPile).toContainEqual(allThree[0]);
    expect(afterAccept.events).toContainEqual({
      type: 'PROPERTY_STIGMATIZED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      cardId: allThree[0]!.id,
    });
  });

  it('rejects targeting a House/Hotel attachment instead of an actual property', () => {
    const haunted = cardById('action-haunted-rumor');
    const propCard = cardById('estate-taikoo-shing');
    const house = cardById('action-house');

    const bob = makePlayer('player-2', 'Bob', {
      field: { ...makeField(), ESTATE: [propCard, cardById('estate-mei-foo-sun-chuen'), cardById('estate-city-one'), house] },
    });
    const alice = makePlayer('player-1', 'Alice', { hand: [haunted] });
    const state = makeState({ players: [alice, bob] });

    const { events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: haunted.id,
      target: { playerId: 'player-2', cardId: house.id },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });
});

describe('bot AI respects 釘子戶 protection', () => {
  it('a level-3 bot never proposes Deal Breaker / Sly Deal / 凶宅傳聞 against a protected leader, even when it is their only complete set', () => {
    const nailHouse = cardById('action-nail-house');
    const allThree = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'].map(cardById);
    const leader = makePlayer('player-2', 'Leader', { field: { ...makeField(), ESTATE: [...allThree, nailHouse] } });

    const dealBreaker = cardById('action-deal-breaker');
    const slyDeal = cardById('action-sly-deal');
    const hauntedRumor = cardById('action-haunted-rumor');
    const bot = makePlayer('player-1', 'Bot', { hand: [dealBreaker, slyDeal, hauntedRumor] });
    const state = makeState({ players: [bot, leader], phase: 'ACTION' });

    const decision = decideBotAction(state, 'player-1', 3);
    // With every property locked behind 釘子戶, none of these three cards has a legal target —
    // the bot must fall through to banking one of them instead of proposing an illegal play.
    expect(decision).toEqual({ type: 'PLAY_CARD', playerId: 'player-1', cardId: dealBreaker.id, asBank: true });
  });
});
