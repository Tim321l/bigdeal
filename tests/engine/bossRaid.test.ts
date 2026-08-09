import { describe, expect, it } from 'vitest';
import { applyAction, initGame } from '../../src/engine/stateManager';
import { checkWinner } from '../../src/engine/winCondition';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('BOSS_RAID mode', () => {
  it('initGame sets a 15-turn limit and starts normally (draw still works, unlike AUCTION_DRAFT)', () => {
    const state = initGame(['Alice', 'Bob'], 1, 'BOSS_RAID');
    expect(state.turnLimit).toBe(15);
    expect(state.phase).toBe('TURN_START');
  });

  it('drawing always triggers a macro event — no 30% roll in this mode', () => {
    const alice = makePlayer('player-1', 'Alice');
    const bob = makePlayer('player-2', 'Bob');
    // rngSeed 999 with normal CLASSIC odds would very likely NOT trigger an event on a single
    // roll (30% chance) — BOSS_RAID must trigger regardless of what the roll would've said.
    const state = makeState({
      mode: 'BOSS_RAID',
      phase: 'TURN_START',
      players: [alice, bob],
      rngSeed: 999,
      deck: [cardById('money-1m-a'), cardById('money-1m-b')],
    });

    const { events } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });
    expect(events.some((e) => e.type === 'MACRO_EVENT_TRIGGERED')).toBe(true);
  });

  it('wins once the whole table’s combined bank reaches $30M', () => {
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-10m'), cardById('money-10m')] });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-10m')] });
    const state = makeState({ mode: 'BOSS_RAID', players: [alice, bob] });

    expect(checkWinner(state)).toBeDefined();
  });

  it('wins once combined complete sets (pooled across everyone) reach 4', () => {
    const colors = ['PUBLIC_HOUSING', 'OLD_TONG_LAU', 'ESTATE', 'COMMERCIAL_LUXURY'] as const;
    const cardIdsByColor: Record<(typeof colors)[number], string[]> = {
      PUBLIC_HOUSING: ['public-housing-tin-shing-yuen', 'public-housing-yau-oi-estate', 'public-housing-ngau-tau-kok-lower-estate'],
      OLD_TONG_LAU: ['tong-lau-apliu-street', 'tong-lau-ladies-market', 'tong-lau-nga-tsin-wai-road'],
      ESTATE: ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'],
      COMMERCIAL_LUXURY: ['commercial-ifc', 'commercial-k11', 'commercial-sze-fan-road'],
    };
    const aliceField = makeField();
    const bobField = makeField();
    for (const color of colors) {
      const ids = cardIdsByColor[color];
      aliceField[color] = [cardById(ids[0]!), cardById(ids[1]!)];
      bobField[color] = [cardById(ids[2]!)];
    }
    const alice = makePlayer('player-1', 'Alice', { field: aliceField });
    const bob = makePlayer('player-2', 'Bob', { field: bobField });
    const state = makeState({ mode: 'BOSS_RAID', players: [alice, bob] });

    expect(checkWinner(state)).toBeDefined();
  });

  it('fails the raid — everyone loses together — once the turn limit expires without the win condition met', () => {
    const alice = makePlayer('player-1', 'Alice');
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'BOSS_RAID', phase: 'ACTION', players: [alice, bob], turn: 15, turnLimit: 15 });

    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.phase).toBe('GAME_OVER');
    expect(nextState.raidFailed).toBe(true);
    expect(nextState.winnerId).toBeUndefined();
    expect(events).toContainEqual({ type: 'RAID_FAILED' });
  });

  it('a win achieved on the exact turn the limit expires still counts as a win, not a failure', () => {
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-10m'), cardById('money-10m'), cardById('money-10m')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'BOSS_RAID', phase: 'ACTION', players: [alice, bob], turn: 15, turnLimit: 15 });

    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.raidFailed).toBeUndefined();
    expect(events.some((e) => e.type === 'GAME_WON')).toBe(true);
  });

  it('banking a card alone can trigger the co-op bank-target win (centralized win check, not just property builds)', () => {
    const moneyCard = cardById('money-10m');
    const alice = makePlayer('player-1', 'Alice', {
      hand: [moneyCard],
      bank: [cardById('money-10m'), cardById('money-10m')], // $20M already banked between the two
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-2m-a')] }); // total so far: $22M
    const state = makeState({ mode: 'BOSS_RAID', phase: 'ACTION', players: [alice, bob] });

    const { nextState } = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: moneyCard.id, asBank: true });
    // $22M + $10M banked = $32M >= $30M target, purely from a CARD_BANKED action.
    expect(nextState.phase).toBe('GAME_OVER');
  });

  it('does not use BOSS_RAID’s co-op win condition in CLASSIC mode', () => {
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-10m'), cardById('money-10m'), cardById('money-10m')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'CLASSIC', players: [alice, bob] });

    expect(checkWinner(state)).toBeUndefined();
  });
});
