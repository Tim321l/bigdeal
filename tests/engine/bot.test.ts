import { describe, expect, it } from 'vitest';
import { decideBotAction } from '../../src/engine/bot';
import { applyAction, initGame } from '../../src/engine/stateManager';
import type { ActionPayload, GameState } from '../../src/types/game';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('decideBotAction: TURN_START', () => {
  it('always draws, regardless of level', () => {
    const state = makeState({ phase: 'TURN_START' });
    for (const level of [1, 2, 3] as const) {
      expect(decideBotAction(state, 'player-1', level)).toEqual({ type: 'DRAW', playerId: 'player-1' });
    }
  });
});

describe('decideBotAction: ACTION phase', () => {
  it('level 1 builds a property when it can', () => {
    const propertyCard = cardById('estate-taikoo-shing');
    const bot = makePlayer('player-1', 'Bot', { hand: [propertyCard] });
    const state = makeState({ players: [bot, makePlayer('player-2', 'Human')] });

    expect(decideBotAction(state, 'player-1', 1)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: propertyCard.id,
    });
  });

  it('level 1 banks whatever it holds when it cannot build, ignoring smarter plays', () => {
    const birthday = cardById('action-birthday');
    const bot = makePlayer('player-1', 'Bot', { hand: [birthday] });
    const state = makeState({ players: [bot, makePlayer('player-2', 'Human')] });

    expect(decideBotAction(state, 'player-1', 1)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: birthday.id,
      asBank: true,
    });
  });

  it('level 2 plays a rent card for a color it owns instead of just banking', () => {
    const rentCard = cardById('rent-estate');
    const bot = makePlayer('player-1', 'Bot', {
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [cardById('estate-taikoo-shing')] },
    });
    const state = makeState({ players: [bot, makePlayer('player-2', 'Human')] });

    expect(decideBotAction(state, 'player-1', 2)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: rentCard.id,
    });
  });

  it('level 2 plays Double Rent first when a usable rent card is also in hand (the combo)', () => {
    const doubleRent = cardById('action-double-rent');
    const rentCard = cardById('rent-estate');
    const bot = makePlayer('player-1', 'Bot', {
      hand: [doubleRent, rentCard],
      field: { ...makeField(), ESTATE: [cardById('estate-taikoo-shing')] },
    });
    const state = makeState({ players: [bot, makePlayer('player-2', 'Human')] });

    expect(decideBotAction(state, 'player-1', 2)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: doubleRent.id,
    });
  });

  it('level 2+ targets the current leader with Deal Breaker on their complete set', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const leaderSet = ['public-housing-tin-shing-yuen', 'public-housing-yau-oi-estate', 'public-housing-ngau-tau-kok-lower-estate'].map(
      cardById,
    );
    const bot = makePlayer('player-1', 'Bot', { hand: [dealBreaker] });
    const leader = makePlayer('player-2', 'Leader', { field: { ...makeField(), PUBLIC_HOUSING: leaderSet } });
    const trailing = makePlayer('player-3', 'Trailing');
    const state = makeState({ players: [bot, leader, trailing] });

    const action = decideBotAction(state, 'player-1', 2);
    expect(action).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });
  });

  it('only level 3 opportunistically Sly Deals the leader when no Deal Breaker target exists', () => {
    const slyDeal = cardById('action-sly-deal');
    const leaderCard = cardById('transport-island-line');
    const bot = makePlayer('player-1', 'Bot', { hand: [slyDeal] });
    const leader = makePlayer('player-2', 'Leader', { field: { ...makeField(), TRANSPORT: [leaderCard] } });
    const state = makeState({ players: [bot, leader] });

    expect(decideBotAction(state, 'player-1', 2)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: slyDeal.id,
      asBank: true,
    });

    expect(decideBotAction(state, 'player-1', 3)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: slyDeal.id,
      target: { playerId: 'player-2', cardId: leaderCard.id },
    });
  });

  it('builds a house on its own complete set at level 2+, and a hotel once a house is present', () => {
    const house = cardById('action-house');
    const completeSet = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'].map(cardById);
    const bot = makePlayer('player-1', 'Bot', { hand: [house], field: { ...makeField(), ESTATE: completeSet } });
    const state = makeState({ players: [bot, makePlayer('player-2', 'Human')] });

    expect(decideBotAction(state, 'player-1', 2)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: house.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });

    const hotel = cardById('action-hotel');
    const withHouse = makePlayer('player-1', 'Bot', {
      hand: [hotel],
      field: { ...makeField(), ESTATE: [...completeSet, house] },
    });
    const stateWithHouse = makeState({ players: [withHouse, makePlayer('player-2', 'Human')] });
    expect(decideBotAction(stateWithHouse, 'player-1', 2)).toEqual({
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: hotel.id,
      target: { playerId: 'player-1', color: 'ESTATE' },
    });
  });

  it('ends the turn when only a Just Say No card is left in hand', () => {
    const justSayNo = cardById('action-just-say-no');
    const bot = makePlayer('player-1', 'Bot', { hand: [justSayNo] });
    const state = makeState({ players: [bot, makePlayer('player-2', 'Human')] });

    expect(decideBotAction(state, 'player-1', 2)).toEqual({ type: 'END_TURN', playerId: 'player-1' });
  });

  it('ends the turn with an empty hand', () => {
    const state = makeState({ players: [makePlayer('player-1', 'Bot'), makePlayer('player-2', 'Human')] });
    expect(decideBotAction(state, 'player-1', 3)).toEqual({ type: 'END_TURN', playerId: 'player-1' });
  });
});

describe('decideBotAction: REACTION_WINDOW', () => {
  function reactionState(cardActionType: 'DEAL_BREAKER' | 'RENT', amount: number) {
    const dealBreaker = cardById('action-deal-breaker');
    const pendingCard = cardActionType === 'DEAL_BREAKER' ? dealBreaker : cardById('rent-estate');
    const justSayNo = cardById('action-just-say-no');
    const bot = makePlayer('player-1', 'Bot', { hand: [justSayNo] });
    const state = makeState({
      players: [makePlayer('player-2', 'Attacker'), bot],
      phase: 'REACTION_WINDOW',
      pendingReaction: {
        card: pendingCard,
        sourcePlayerId: 'player-2',
        targetQueue: ['player-1'],
        currentResponderId: 'player-1',
        cancelled: false,
        amount,
      },
    });
    return state;
  }

  it('level 1 always accepts, even holding Just Say No', () => {
    const state = reactionState('DEAL_BREAKER', 0);
    expect(decideBotAction(state, 'player-1', 1)).toEqual({ type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });
  });

  it('level 3 always defends with Just Say No when it has one', () => {
    const state = reactionState('RENT', 1);
    const action = decideBotAction(state, 'player-1', 3) as Extract<ActionPayload, { type: 'RESPOND' }>;
    expect(action.response).toBe('JUST_SAY_NO');
  });

  it('level 2 defends against a severe threat (Deal Breaker) but accepts a mild rent charge', () => {
    const severe = reactionState('DEAL_BREAKER', 0);
    const severeAction = decideBotAction(severe, 'player-1', 2) as Extract<ActionPayload, { type: 'RESPOND' }>;
    expect(severeAction.response).toBe('JUST_SAY_NO');

    const mild = reactionState('RENT', 1);
    expect(decideBotAction(mild, 'player-1', 2)).toEqual({ type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });
  });

  it('accepts when it has no Just Say No to play, regardless of level', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const bot = makePlayer('player-1', 'Bot', { hand: [] });
    const state = makeState({
      players: [makePlayer('player-2', 'Attacker'), bot],
      phase: 'REACTION_WINDOW',
      pendingReaction: {
        card: dealBreaker,
        sourcePlayerId: 'player-2',
        targetQueue: ['player-1'],
        currentResponderId: 'player-1',
        cancelled: false,
      },
    });
    expect(decideBotAction(state, 'player-1', 3)).toEqual({ type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });
  });
});

describe('bot-vs-bot integration', () => {
  function runUntilHumanOrDone(state: GameState, botLevels: Record<string, 1 | 2 | 3>, maxSteps: number): GameState {
    let current = state;
    for (let i = 0; i < maxSteps; i++) {
      if (current.phase === 'GAME_OVER') break;

      let actorId: string | undefined;
      if (current.phase === 'REACTION_WINDOW') {
        actorId = current.pendingReaction?.currentResponderId;
      } else if (current.phase === 'TURN_START' || current.phase === 'ACTION') {
        actorId = current.players[current.activePlayerIndex]?.id;
      }
      if (!actorId || !(actorId in botLevels)) break;

      const action = decideBotAction(current, actorId, botLevels[actorId]!);
      current = applyAction(current, action).nextState;
    }
    return current;
  }

  it('two bots can play a full game against each other without crashing or hanging', () => {
    const state = initGame(['Bot A', 'Bot B'], 2024);
    const levels: Record<string, 1 | 2 | 3> = { 'player-1': 3, 'player-2': 3 };

    const finalState = runUntilHumanOrDone(state, levels, 4000);

    // Either someone won, or we safely ran out of steps without an infinite loop/crash — both
    // are acceptable outcomes for this smoke test; what matters is it never throws and always
    // terminates the loop (i.e. never gets permanently stuck demanding a response nobody gives).
    expect(['GAME_OVER', 'TURN_START', 'ACTION', 'REACTION_WINDOW']).toContain(finalState.phase);
    if (finalState.phase === 'GAME_OVER') {
      expect(finalState.winnerId).toBeDefined();
    }
  });

  it('mixed difficulty bots (1 vs 3) also complete without error', () => {
    const state = initGame(['Easy Bot', 'Hard Bot'], 7);
    const levels: Record<string, 1 | 2 | 3> = { 'player-1': 1, 'player-2': 3 };

    expect(() => runUntilHumanOrDone(state, levels, 4000)).not.toThrow();
  });
});
