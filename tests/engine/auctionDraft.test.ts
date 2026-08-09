import { describe, expect, it } from 'vitest';
import { applyAction, initGame } from '../../src/engine/stateManager';
import { cardById, makePlayer, makeState } from './testUtils';

describe('AUCTION_DRAFT mode', () => {
  it('initGame opens straight into an auction — no TURN_START/draw step', () => {
    const state = initGame(['Alice', 'Bob'], 1, 'AUCTION_DRAFT');
    expect(state.phase).toBe('AUCTION');
    expect(state.pendingAuction?.cards).toHaveLength(3);
    expect(state.pendingAuction?.bids).toEqual({});
  });

  it('the highest bidder wins the lot into hand and pays their bid from the bank', () => {
    const lot = [cardById('money-1m-a'), cardById('money-1m-b'), cardById('money-1m-c')];
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-5m-a'), cardById('money-2m-a')] });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-3m-a')] });
    const state = makeState({ mode: 'AUCTION_DRAFT', phase: 'AUCTION', players: [alice, bob], pendingAuction: { cards: lot, bids: {} } });

    const afterAlice = applyAction(state, { type: 'SUBMIT_BID', playerId: 'player-1', amount: 4 });
    expect(afterAlice.events).toContainEqual({ type: 'BID_SUBMITTED', playerId: 'player-1' });
    expect(afterAlice.nextState.phase).toBe('AUCTION'); // still waiting on Bob

    const afterBob = applyAction(afterAlice.nextState, { type: 'SUBMIT_BID', playerId: 'player-2', amount: 3 });

    expect(afterBob.nextState.phase).toBe('ACTION');
    expect(afterBob.nextState.pendingAuction).toBeUndefined();
    expect(afterBob.nextState.players[0]?.hand).toEqual(expect.arrayContaining(lot));
    // Alice bid 4; autoPickPayment goes cheapest-first ($2M, then $5M) until it covers >= 4, so
    // both bank cards get spent even though $5M alone would've overpaid — no change-making here.
    expect(afterBob.nextState.players[0]?.bank).toHaveLength(0);
    expect(afterBob.events).toContainEqual({
      type: 'AUCTION_RESOLVED',
      winnerId: 'player-1',
      winningBid: 4,
      bids: { 'player-1': 4, 'player-2': 3 },
    });
  });

  it('ties go to the earliest-seated bidder', () => {
    const lot = [cardById('money-1m-a')];
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-5m-a')] });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-5m-b')] });
    const state = makeState({ mode: 'AUCTION_DRAFT', phase: 'AUCTION', players: [alice, bob], pendingAuction: { cards: lot, bids: {} } });

    const afterAlice = applyAction(state, { type: 'SUBMIT_BID', playerId: 'player-1', amount: 3 });
    const afterBob = applyAction(afterAlice.nextState, { type: 'SUBMIT_BID', playerId: 'player-2', amount: 3 });

    expect(afterBob.events).toContainEqual(expect.objectContaining({ type: 'AUCTION_RESOLVED', winnerId: 'player-1' }));
  });

  it('rejects a bid larger than the bidder’s bank total', () => {
    const lot = [cardById('money-1m-a')];
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-2m-a')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'AUCTION_DRAFT', phase: 'AUCTION', players: [alice, bob], pendingAuction: { cards: lot, bids: {} } });

    const { events, nextState } = applyAction(state, { type: 'SUBMIT_BID', playerId: 'player-1', amount: 5 });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.pendingAuction?.bids['player-1']).toBeUndefined();
  });

  it('rejects bidding twice in the same round', () => {
    const lot = [cardById('money-1m-a')];
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-5m-a')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({
      mode: 'AUCTION_DRAFT',
      phase: 'AUCTION',
      players: [alice, bob],
      pendingAuction: { cards: lot, bids: { 'player-1': 2 } },
    });

    const { events } = applyAction(state, { type: 'SUBMIT_BID', playerId: 'player-1', amount: 3 });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });

  it('rejects SUBMIT_BID outside AUCTION_DRAFT mode', () => {
    const alice = makePlayer('player-1', 'Alice', { bank: [cardById('money-5m-a')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'CLASSIC', players: [alice, bob] });

    const { events } = applyAction(state, { type: 'SUBMIT_BID', playerId: 'player-1', amount: 1 });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });

  it('ending a turn opens a fresh auction instead of TURN_START', () => {
    const alice = makePlayer('player-1', 'Alice');
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({
      mode: 'AUCTION_DRAFT',
      phase: 'ACTION',
      players: [alice, bob],
      deck: [cardById('money-1m-a'), cardById('money-1m-b'), cardById('money-1m-c'), cardById('money-1m-d')],
    });

    const { nextState } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.phase).toBe('AUCTION');
    expect(nextState.pendingAuction?.cards).toHaveLength(3);
    expect(nextState.activePlayerIndex).toBe(1);
  });

  it('skips straight to ACTION when the deck and discard are both empty', () => {
    const alice = makePlayer('player-1', 'Alice');
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ mode: 'AUCTION_DRAFT', phase: 'ACTION', players: [alice, bob], deck: [], discardPile: [] });

    const { nextState } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.phase).toBe('ACTION');
    expect(nextState.pendingAuction).toBeUndefined();
  });
});
