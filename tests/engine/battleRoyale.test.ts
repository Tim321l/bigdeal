import { describe, expect, it } from 'vitest';
import { applyAction, initGame } from '../../src/engine/stateManager';
import { checkWinner, countCompleteSets } from '../../src/engine/winCondition';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('釘子戶 does not fake-complete a set (regression)', () => {
  it('a 2-property color with a 釘子戶 attached does not count as a complete set', () => {
    const nailHouse = cardById('action-nail-house');
    const twoProperties = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen'].map(cardById);

    const alice = makePlayer('player-1', 'Alice', {
      field: { ...makeField(), ESTATE: [...twoProperties, nailHouse] },
    });

    expect(alice.field.ESTATE).toHaveLength(3); // raw array length is 3 — the trap this guards against
    expect(countCompleteSets(alice)).toBe(0);
  });

  it('cannot win with only 2 genuinely complete sets plus a 釘子戶-padded incomplete one', () => {
    const nailHouse = cardById('action-nail-house');
    const twoProperties = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen'].map(cardById);
    const completeA = ['public-housing-tin-shing-yuen', 'public-housing-yau-oi-estate', 'public-housing-ngau-tau-kok-lower-estate'].map(
      cardById,
    );
    const completeB = ['tong-lau-apliu-street', 'tong-lau-ladies-market', 'tong-lau-nga-tsin-wai-road'].map(cardById);

    const alice = makePlayer('player-1', 'Alice', {
      field: {
        ...makeField(),
        PUBLIC_HOUSING: completeA,
        OLD_TONG_LAU: completeB,
        ESTATE: [...twoProperties, nailHouse],
      },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    expect(checkWinner(state)).toBeUndefined();
  });
});

describe('BATTLE_ROYALE mode', () => {
  it('initGame defaults to CLASSIC and can be started in BATTLE_ROYALE', () => {
    const classic = initGame(['Alice', 'Bob'], 1);
    expect(classic.mode).toBe('CLASSIC');

    const royale = initGame(['Alice', 'Bob'], 1, 'BATTLE_ROYALE');
    expect(royale.mode).toBe('BATTLE_ROYALE');
  });

  it('doubles rent charges', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing'); // rentTiers [2, 4, 6]; owning 1 => base 2

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-10m')] });
    const state = makeState({ mode: 'BATTLE_ROYALE', players: [alice, bob] });

    const { nextState } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    expect(nextState.pendingReaction?.amount).toBe(4); // 2 * 2
  });

  it('doubles Debt Collector and Birthday amounts too', () => {
    const debtCollector = cardById('action-debt-collector');
    const alice = makePlayer('player-1', 'Alice', { hand: [debtCollector] });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-10m')] });
    const state = makeState({ mode: 'BATTLE_ROYALE', players: [alice, bob] });

    const { nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: debtCollector.id,
      target: { playerId: 'player-2' },
    });
    expect(nextState.pendingReaction?.amount).toBe(10); // 5 * 2
  });

  it('eliminates a player who cannot cover a charge, transferring bank/hand/field to the collector', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');
    const bobHandCard = cardById('money-1m-a');
    const bobFieldCard = cardById('public-housing-tin-shing-yuen');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob', {
      hand: [bobHandCard],
      field: { ...makeField(), PUBLIC_HOUSING: [bobFieldCard] },
    });
    const state = makeState({ mode: 'BATTLE_ROYALE', players: [alice, bob] });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    const afterAccept = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    const eliminated = afterAccept.nextState.players[1];
    const collector = afterAccept.nextState.players[0];
    expect(eliminated?.eliminated).toBe(true);
    expect(eliminated?.hand).toHaveLength(0);
    expect(eliminated?.bank).toHaveLength(0);
    expect(eliminated?.field.PUBLIC_HOUSING).toHaveLength(0);
    // Seized assets land in the collector's BANK, not hand — a bankruptcy payout is inert value,
    // not a free ready-to-play card (which could hand over something like Deal Breaker outright).
    expect(collector?.bank).toContainEqual(bobHandCard);
    expect(collector?.field.PUBLIC_HOUSING).toContainEqual(bobFieldCard);
    expect(afterAccept.events).toContainEqual({ type: 'PLAYER_ELIMINATED', playerId: 'player-2', collectorId: 'player-1' });
  });

  it('ends the game the instant only one player remains', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob'); // nothing to pay with
    const state = makeState({ mode: 'BATTLE_ROYALE', players: [alice, bob] });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    const afterAccept = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(afterAccept.nextState.phase).toBe('GAME_OVER');
    expect(afterAccept.nextState.winnerId).toBe('player-1');
    expect(afterAccept.events).toContainEqual({ type: 'GAME_WON', playerId: 'player-1' });
  });

  it('does NOT eliminate a player in CLASSIC mode, even if they cannot fully cover a charge', () => {
    const rentCard = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [rentCard],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob'); // nothing to pay with
    const state = makeState({ mode: 'CLASSIC', players: [alice, bob] });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: rentCard.id });
    const afterAccept = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(afterAccept.nextState.players[1]?.eliminated).toBeUndefined();
    expect(afterAccept.nextState.phase).not.toBe('GAME_OVER');
  });

  it('skips an eliminated player when advancing turns', () => {
    const alice = makePlayer('player-1', 'Alice');
    const bob = makePlayer('player-2', 'Bob', { eliminated: true });
    const carol = makePlayer('player-3', 'Carol');
    const state = makeState({ mode: 'BATTLE_ROYALE', players: [alice, bob, carol], activePlayerIndex: 0, phase: 'ACTION' });

    const { nextState } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.activePlayerIndex).toBe(2); // skips bob (index 1)
    expect(nextState.players[nextState.activePlayerIndex]?.id).toBe('player-3');
  });

  it('an eliminated player cannot be targeted by any card', () => {
    const pickpocket = cardById('action-pickpocket');
    const alice = makePlayer('player-1', 'Alice', { hand: [pickpocket] });
    const bob = makePlayer('player-2', 'Bob', { eliminated: true, hand: [cardById('money-1m-a')] });
    const state = makeState({ mode: 'BATTLE_ROYALE', players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: pickpocket.id,
      target: { playerId: 'player-2' },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(pickpocket);
  });
});
