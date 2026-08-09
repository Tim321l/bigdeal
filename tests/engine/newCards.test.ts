import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('wild RENT cards', () => {
  it('2-color wild rent charges every opponent for the chosen color', () => {
    const wildRent = cardById('rent-wild-housing-tonglau'); // PUBLIC_HOUSING / OLD_TONG_LAU
    const propCard = cardById('public-housing-tin-shing-yuen'); // rentTiers [1, 2, 4]

    const alice = makePlayer('player-1', 'Alice', {
      hand: [wildRent],
      field: { ...makeField(), PUBLIC_HOUSING: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: wildRent.id,
      target: { playerId: 'player-1', color: 'PUBLIC_HOUSING' },
    });

    expect(nextState.pendingReaction?.amount).toBe(1);
    expect(nextState.pendingReaction?.targetQueue).toEqual(['player-2']);
  });

  it('rejects a wild rent play with no color chosen, returning the card to hand', () => {
    const wildRent = cardById('rent-wild-housing-tonglau');
    const propCard = cardById('public-housing-tin-shing-yuen');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [wildRent],
      field: { ...makeField(), PUBLIC_HOUSING: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: wildRent.id,
    });

    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(wildRent);
    expect(nextState.pendingReaction).toBeUndefined();
  });

  it('fully-wild (rentScope SINGLE) rent only charges the one chosen opponent, not everyone', () => {
    const universalRent = cardById('rent-wild-universal-1');
    const propCard = cardById('estate-taikoo-shing'); // ESTATE rentTiers [2, 4, 6]

    const alice = makePlayer('player-1', 'Alice', {
      hand: [universalRent],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob');
    const carol = makePlayer('player-3', 'Carol');
    const state = makeState({ players: [alice, bob, carol] });

    const { nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: universalRent.id,
      target: { playerId: 'player-2', color: 'ESTATE' },
    });

    expect(nextState.pendingReaction?.amount).toBe(2);
    expect(nextState.pendingReaction?.targetQueue).toEqual(['player-2']);
  });

  it('rejects a fully-wild rent play with no opponent chosen', () => {
    const universalRent = cardById('rent-wild-universal-1');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [universalRent],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: universalRent.id,
      target: { playerId: 'player-1', color: 'ESTATE' }, // self, not a real opponent
    });

    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(universalRent);
  });
});

describe('打荷包 (PICKPOCKET)', () => {
  it('moves a random card from the target hand to the source hand on ACCEPT', () => {
    const pickpocket = cardById('action-pickpocket');
    const stolenCandidate = cardById('money-1m-a');

    const alice = makePlayer('player-1', 'Alice', { hand: [pickpocket] });
    const bob = makePlayer('player-2', 'Bob', { hand: [stolenCandidate] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: pickpocket.id,
      target: { playerId: 'player-2' },
    });
    expect(afterPlay.nextState.phase).toBe('REACTION_WINDOW');

    const afterAccept = applyAction(afterPlay.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
    });

    expect(afterAccept.nextState.players[1]?.hand).toHaveLength(0);
    expect(afterAccept.nextState.players[0]?.hand).toContainEqual(stolenCandidate);
    expect(afterAccept.events).toContainEqual({
      type: 'HAND_CARD_STOLEN',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      success: true,
    });
  });

  it('reports success: false instead of silently doing nothing when the target hand is empty', () => {
    const pickpocket = cardById('action-pickpocket');

    const alice = makePlayer('player-1', 'Alice', { hand: [pickpocket] });
    const bob = makePlayer('player-2', 'Bob', { hand: [] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: pickpocket.id,
      target: { playerId: 'player-2' },
    });
    const afterAccept = applyAction(afterPlay.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'ACCEPT',
    });

    expect(afterAccept.events).toContainEqual({
      type: 'HAND_CARD_STOLEN',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      success: false,
    });
  });

  it('can be cancelled by Just Say No like any other action', () => {
    const pickpocket = cardById('action-pickpocket');
    const justSayNo = cardById('action-just-say-no');
    const guardedCard = cardById('money-1m-a');

    const alice = makePlayer('player-1', 'Alice', { hand: [pickpocket] });
    const bob = makePlayer('player-2', 'Bob', { hand: [justSayNo, guardedCard] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: pickpocket.id,
      target: { playerId: 'player-2' },
    });
    const afterCancel = applyAction(afterPlay.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
      cardId: justSayNo.id,
    });
    const afterFinalAccept = applyAction(afterCancel.nextState, {
      type: 'RESPOND',
      playerId: 'player-1',
      response: 'ACCEPT',
    });

    expect(afterFinalAccept.nextState.players[1]?.hand).toContainEqual(guardedCard);
    expect(afterFinalAccept.nextState.players[0]?.hand).not.toContainEqual(guardedCard);
  });

  it('requires an opponent target and refuses to target yourself', () => {
    const pickpocket = cardById('action-pickpocket');
    const alice = makePlayer('player-1', 'Alice', { hand: [pickpocket] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: pickpocket.id,
    });

    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(pickpocket);
  });
});
