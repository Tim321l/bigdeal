import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/data/cards';
import { applyAction } from '../../src/engine/stateManager';
import type { MacroEvent } from '../../src/types/game';
import { cardById, makePlayer, makeState } from './testUtils';

describe('per-turn action limit', () => {
  it('allows exactly 3 plays and rejects a 4th', () => {
    const fillerIds = ['action-double-rent', 'action-just-say-no', 'rent-transport', 'rent-estate'];
    const filler = fillerIds.map(cardById);
    let state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand: filler }), makePlayer('player-2', 'Bob')],
    });

    for (let i = 0; i < 3; i++) {
      const card = filler[i]!;
      const result = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: card.id, asBank: true });
      expect(result.events).not.toContainEqual(expect.objectContaining({ type: 'INVALID_ACTION' }));
      state = result.nextState;
    }
    expect(state.actionsPlayedThisTurn).toBe(3);
    expect(state.players[0]?.bank).toHaveLength(3);

    const fourthCard = filler[3]!;
    const rejected = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: fourthCard.id,
      asBank: true,
    });
    expect(rejected.events).toContainEqual({ type: 'INVALID_ACTION', reason: 'No actions remaining this turn.' });
    expect(rejected.nextState.players[0]?.hand.map((c) => c.id)).toEqual([fourthCard.id]);
    expect(rejected.nextState.players[0]?.bank).toHaveLength(3);
  });

  it('extends the limit to 5 while 全面撤辣 (ACTION_LIMIT +2) is active', () => {
    const stampDutyRemoval: MacroEvent = {
      id: 'stamp-duty-removal',
      name: '全面撤辣',
      description: '',
      durationTurns: 3,
      modifiers: [{ target: 'ACTION_LIMIT', operator: 'ADD', value: 2 }],
    };
    const filler = CARDS.slice(0, 5);
    let state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand: filler }), makePlayer('player-2', 'Bob')],
      activeMacroEvents: [stampDutyRemoval],
    });

    for (let i = 0; i < 5; i++) {
      const card = filler[i]!;
      state = applyAction(state, { type: 'PLAY_CARD', playerId: 'player-1', cardId: card.id, asBank: true }).nextState;
    }
    expect(state.actionsPlayedThisTurn).toBe(5);
    expect(state.players[0]?.bank).toHaveLength(5);
  });

  it('does not count DRAW against the per-turn action limit', () => {
    const state = makeState({ phase: 'TURN_START', deck: CARDS.slice(0, 10), rngSeed: 1 });
    const { nextState } = applyAction(state, { type: 'DRAW', playerId: 'player-1' });
    expect(nextState.actionsPlayedThisTurn).toBe(0);
  });

  it('resets actionsPlayedThisTurn for the next player after END_TURN', () => {
    const filler = cardById('action-double-rent');
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand: [filler] }), makePlayer('player-2', 'Bob')],
    });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: filler.id,
      asBank: true,
    });
    expect(afterPlay.nextState.actionsPlayedThisTurn).toBe(1);

    const afterEnd = applyAction(afterPlay.nextState, { type: 'END_TURN', playerId: 'player-1' });
    expect(afterEnd.nextState.actionsPlayedThisTurn).toBe(0);
    expect(afterEnd.nextState.activePlayerIndex).toBe(1);
    expect(afterEnd.nextState.phase).toBe('TURN_START');
  });
});

describe('hand-size discarding', () => {
  it('does not discard when the hand is exactly 7', () => {
    const hand = CARDS.slice(0, 7);
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand }), makePlayer('player-2', 'Bob')],
    });
    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.players[0]?.hand).toHaveLength(7);
    expect(nextState.discardPile).toHaveLength(0);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'HAND_DISCARDED' }));
  });

  it('discards exactly 1 card when the hand is 8', () => {
    const hand = CARDS.slice(0, 8);
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand }), makePlayer('player-2', 'Bob')],
    });
    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.players[0]?.hand).toHaveLength(7);
    expect(nextState.discardPile).toHaveLength(1);
    expect(events).toContainEqual({ type: 'HAND_DISCARDED', playerId: 'player-1', count: 1 });
  });

  it('discards down to 7 from a hand of 10', () => {
    const hand = CARDS.slice(0, 10);
    const state = makeState({
      players: [makePlayer('player-1', 'Alice', { hand }), makePlayer('player-2', 'Bob')],
    });
    const { nextState, events } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.players[0]?.hand).toHaveLength(7);
    expect(nextState.discardPile).toHaveLength(3);
    expect(events).toContainEqual({ type: 'HAND_DISCARDED', playerId: 'player-1', count: 3 });
  });

  it("enforces each player's hand limit independently", () => {
    const aliceHand = CARDS.slice(0, 9);
    const bobHand = CARDS.slice(9, 14); // 5 cards, under the limit
    const state = makeState({
      players: [
        makePlayer('player-1', 'Alice', { hand: aliceHand }),
        makePlayer('player-2', 'Bob', { hand: bobHand }),
      ],
    });

    const { nextState } = applyAction(state, { type: 'END_TURN', playerId: 'player-1' });
    expect(nextState.players[0]?.hand).toHaveLength(7);
    expect(nextState.players[1]?.hand).toHaveLength(5); // untouched — not Bob's turn to end
  });
});
