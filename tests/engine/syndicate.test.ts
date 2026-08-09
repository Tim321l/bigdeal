import { describe, expect, it } from 'vitest';
import { applyAction, initGame } from '../../src/engine/stateManager';
import { checkWinner, countTeamCompleteSets } from '../../src/engine/winCondition';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('SYNDICATE mode', () => {
  it('initGame assigns teams by seat parity for a 4-player game', () => {
    const state = initGame(['Alice', 'Bob', 'Carol', 'Dave'], 1, 'SYNDICATE');
    expect(state.players.map((p) => p.teamId)).toEqual([0, 1, 0, 1]);
  });

  it('does not assign teamId in CLASSIC mode', () => {
    const state = initGame(['Alice', 'Bob'], 1, 'CLASSIC');
    expect(state.players.every((p) => p.teamId === undefined)).toBe(true);
  });

  it('pools teammates’ properties for the team complete-set count', () => {
    const alice = makePlayer('player-1', 'Alice', {
      teamId: 0,
      field: { ...makeField(), ESTATE: ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen'].map(cardById) },
    });
    const carol = makePlayer('player-3', 'Carol', {
      teamId: 0,
      field: { ...makeField(), ESTATE: [cardById('estate-city-one')] },
    });
    const bob = makePlayer('player-2', 'Bob', { teamId: 1 });
    const state = makeState({ mode: 'SYNDICATE', players: [alice, bob, carol] });

    expect(countTeamCompleteSets(state, 0)).toBe(1); // 2 + 1 = 3 ESTATE combined
    expect(countTeamCompleteSets(state, 1)).toBe(0);
  });

  it('a team wins once its combined sets reach 4, reporting one teammate as the representative id', () => {
    const colors = ['PUBLIC_HOUSING', 'OLD_TONG_LAU', 'ESTATE', 'COMMERCIAL_LUXURY'] as const;
    const cardIdsByColor: Record<(typeof colors)[number], string[]> = {
      PUBLIC_HOUSING: ['public-housing-tin-shing-yuen', 'public-housing-yau-oi-estate', 'public-housing-ngau-tau-kok-lower-estate'],
      OLD_TONG_LAU: ['tong-lau-apliu-street', 'tong-lau-ladies-market', 'tong-lau-nga-tsin-wai-road'],
      ESTATE: ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'],
      COMMERCIAL_LUXURY: ['commercial-ifc', 'commercial-k11', 'commercial-sze-fan-road'],
    };

    const aliceField = makeField();
    const carolField = makeField();
    // Split 2/1 across each of the 4 colors between the two teammates.
    for (const color of colors) {
      const ids = cardIdsByColor[color];
      aliceField[color] = [cardById(ids[0]!), cardById(ids[1]!)];
      carolField[color] = [cardById(ids[2]!)];
    }

    const alice = makePlayer('player-1', 'Alice', { teamId: 0, field: aliceField });
    const carol = makePlayer('player-3', 'Carol', { teamId: 0, field: carolField });
    const bob = makePlayer('player-2', 'Bob', { teamId: 1 });
    const dave = makePlayer('player-4', 'Dave', { teamId: 1 });
    const state = makeState({ mode: 'SYNDICATE', players: [alice, bob, carol, dave] });

    expect(countTeamCompleteSets(state, 0)).toBe(4);
    const winnerId = checkWinner(state);
    expect(['player-1', 'player-3']).toContain(winnerId);
  });

  it('resolveOpponent refuses to target your own teammate', () => {
    const sly = cardById('action-sly-deal');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', { teamId: 0, hand: [sly] });
    const carol = makePlayer('player-3', 'Carol', { teamId: 0, field: { ...makeField(), ESTATE: [propCard] } });
    const bob = makePlayer('player-2', 'Bob', { teamId: 1 });
    const state = makeState({ mode: 'SYNDICATE', players: [alice, bob, carol] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: sly.id,
      target: { playerId: 'player-3', cardId: propCard.id },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(sly);
  });

  it('RENT with no explicit target charges opponents only, never a teammate', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', {
      teamId: 0,
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const carol = makePlayer('player-3', 'Carol', { teamId: 0 }); // teammate — must NOT be charged
    const bob = makePlayer('player-2', 'Bob', { teamId: 1, bank: [cardById('money-10m')] });
    const state = makeState({ mode: 'SYNDICATE', players: [alice, bob, carol] });

    const { nextState } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    expect(nextState.pendingReaction?.targetQueue).toEqual(['player-2']);
  });

  it('GIFT_CARD hands a card straight to a teammate, costing one action', () => {
    const giftedCard = cardById('money-3m-a');
    const alice = makePlayer('player-1', 'Alice', { teamId: 0, hand: [giftedCard] });
    const carol = makePlayer('player-3', 'Carol', { teamId: 0 });
    const bob = makePlayer('player-2', 'Bob', { teamId: 1 });
    const state = makeState({ mode: 'SYNDICATE', players: [alice, bob, carol] });

    const { nextState, events } = applyAction(state, {
      type: 'GIFT_CARD',
      playerId: 'player-1',
      cardId: giftedCard.id,
      toPlayerId: 'player-3',
    });

    expect(nextState.players[0]?.hand).toHaveLength(0);
    expect(nextState.players[2]?.hand).toContainEqual(giftedCard);
    expect(nextState.actionsPlayedThisTurn).toBe(1);
    expect(events).toContainEqual({ type: 'CARD_GIFTED', fromPlayerId: 'player-1', toPlayerId: 'player-3' });
  });

  it('rejects GIFT_CARD to a non-teammate', () => {
    const card = cardById('money-3m-a');
    const alice = makePlayer('player-1', 'Alice', { teamId: 0, hand: [card] });
    const bob = makePlayer('player-2', 'Bob', { teamId: 1 });
    const state = makeState({ mode: 'SYNDICATE', players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'GIFT_CARD',
      playerId: 'player-1',
      cardId: card.id,
      toPlayerId: 'player-2',
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(card);
  });

  it('rejects GIFT_CARD outside SYNDICATE mode', () => {
    const card = cardById('money-3m-a');
    const alice = makePlayer('player-1', 'Alice', { hand: [card] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'CLASSIC', players: [alice, bob] });

    const { events } = applyAction(state, {
      type: 'GIFT_CARD',
      playerId: 'player-1',
      cardId: card.id,
      toPlayerId: 'player-2',
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });
});
