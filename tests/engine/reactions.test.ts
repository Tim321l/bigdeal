import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

const PUBLIC_HOUSING_SET = [
  'public-housing-tin-shing-yuen',
  'public-housing-yau-oi-estate',
  'public-housing-ngau-tau-kok-lower-estate',
].map(cardById);

describe('chained Just Say No (封區)', () => {
  it('A plays Deal Breaker -> B plays Just Say No -> A counters with Just Say No -> the steal goes through', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const justSayNo = cardById('action-just-say-no');

    const alice = makePlayer('player-1', 'Alice', { hand: [dealBreaker, justSayNo] });
    const bob = makePlayer('player-2', 'Bob', {
      hand: [justSayNo],
      field: { ...makeField(), PUBLIC_HOUSING: PUBLIC_HOUSING_SET },
    });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });
    expect(played.nextState.phase).toBe('REACTION_WINDOW');
    expect(played.nextState.pendingReaction?.currentResponderId).toBe('player-2');

    const bobBlocks = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
    });
    expect(bobBlocks.nextState.phase).toBe('REACTION_WINDOW');
    expect(bobBlocks.nextState.pendingReaction?.cancelled).toBe(true);
    expect(bobBlocks.nextState.pendingReaction?.currentResponderId).toBe('player-1');

    const aliceCounters = applyAction(bobBlocks.nextState, {
      type: 'RESPOND',
      playerId: 'player-1',
      response: 'JUST_SAY_NO',
    });
    expect(aliceCounters.nextState.pendingReaction?.cancelled).toBe(false);
    expect(aliceCounters.nextState.pendingReaction?.currentResponderId).toBe('player-2');

    // Bob has no more 封區 cards, so he must accept — the Deal Breaker resolves after all.
    const bobAccepts = applyAction(aliceCounters.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
    });
    expect(bobAccepts.nextState.phase).toBe('ACTION');
    expect(bobAccepts.nextState.players[0]?.field.PUBLIC_HOUSING).toHaveLength(3);
    expect(bobAccepts.nextState.players[1]?.field.PUBLIC_HOUSING).toHaveLength(0);
  });

  it('cancellation stands when the source has no Just Say No to counter with', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const justSayNo = cardById('action-just-say-no');

    const alice = makePlayer('player-1', 'Alice', { hand: [dealBreaker] }); // no counter card
    const bob = makePlayer('player-2', 'Bob', {
      hand: [justSayNo],
      field: { ...makeField(), PUBLIC_HOUSING: PUBLIC_HOUSING_SET },
    });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });
    const bobBlocks = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
    });
    expect(bobBlocks.nextState.pendingReaction?.currentResponderId).toBe('player-1');

    const aliceFailsToCounter = applyAction(bobBlocks.nextState, {
      type: 'RESPOND',
      playerId: 'player-1',
      response: 'JUST_SAY_NO',
    });
    expect(aliceFailsToCounter.events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'You do not have a 封區 (Just Say No) card to play.',
    });
    expect(aliceFailsToCounter.nextState.phase).toBe('REACTION_WINDOW'); // unchanged, still her turn to respond

    const aliceAccepts = applyAction(bobBlocks.nextState, {
      type: 'RESPOND',
      playerId: 'player-1',
      response: 'ACCEPT',
    });
    expect(aliceAccepts.nextState.phase).toBe('ACTION');
    expect(aliceAccepts.nextState.players[1]?.field.PUBLIC_HOUSING).toHaveLength(3);
    expect(aliceAccepts.nextState.players[0]?.field.PUBLIC_HOUSING).toHaveLength(0);
  });

  it('keeps cancellation state independent per target in a multi-target reaction (BIRTHDAY)', () => {
    const birthday = cardById('action-birthday');
    const justSayNo = cardById('action-just-say-no');

    const alice = makePlayer('player-1', 'Alice', { hand: [birthday] }); // no counter
    const bob = makePlayer('player-2', 'Bob', { hand: [justSayNo] }); // will block
    const carol = makePlayer('player-3', 'Carol', { bank: [cardById('commercial-k11')] }); // will accept & pay
    const state = makeState({ players: [alice, bob, carol] });

    const played = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: birthday.id });
    expect(played.nextState.pendingReaction?.targetQueue).toEqual(['player-2', 'player-3']);

    const bobBlocks = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
    });
    const aliceAccepts = applyAction(bobBlocks.nextState, {
      type: 'RESPOND',
      playerId: 'player-1',
      response: 'ACCEPT',
    });

    // Bob's cancellation stands; the queue advances to Carol with a *fresh*, non-cancelled reaction.
    expect(aliceAccepts.nextState.pendingReaction?.targetQueue).toEqual(['player-3']);
    expect(aliceAccepts.nextState.pendingReaction?.cancelled).toBe(false);
    expect(aliceAccepts.nextState.pendingReaction?.currentResponderId).toBe('player-3');
    expect(aliceAccepts.nextState.players[1]?.bank).toHaveLength(0); // Bob paid nothing

    const carolAccepts = applyAction(aliceAccepts.nextState, {
      type: 'RESPOND',
      playerId: 'player-3',
      response: 'ACCEPT',
    });
    expect(carolAccepts.nextState.phase).toBe('ACTION');
    expect(carolAccepts.nextState.players[0]?.bank).toHaveLength(1); // Carol paid
  });
});

describe('race conditions around the reaction window', () => {
  it('rejects an unrelated PLAY_CARD from the active player while a reaction window is open', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const filler = cardById('action-double-rent');

    const alice = makePlayer('player-1', 'Alice', { hand: [dealBreaker, filler] });
    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), PUBLIC_HOUSING: PUBLIC_HOUSING_SET } });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });
    expect(played.nextState.phase).toBe('REACTION_WINDOW');

    const jumpQueue = applyAction(played.nextState, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: filler.id,
    });
    expect(jumpQueue.events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'Cards can only be played during the action phase.',
    });
    expect(jumpQueue.nextState.players[0]?.hand.map((c) => c.id)).toEqual([filler.id]);
  });

  it('rejects a RESPOND from anyone other than the current responder', () => {
    const dealBreaker = cardById('action-deal-breaker');
    const alice = makePlayer('player-1', 'Alice', { hand: [dealBreaker] });
    const bob = makePlayer('player-2', 'Bob', { field: { ...makeField(), PUBLIC_HOUSING: PUBLIC_HOUSING_SET } });
    const state = makeState({ players: [alice, bob] });

    const played = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: dealBreaker.id,
      target: { playerId: 'player-2', color: 'PUBLIC_HOUSING' },
    });

    const wrongResponder = applyAction(played.nextState, {
      type: 'RESPOND',
      playerId: 'player-1',
      response: 'ACCEPT',
    });
    expect(wrongResponder.events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'It is not your turn to respond.',
    });
  });
});
