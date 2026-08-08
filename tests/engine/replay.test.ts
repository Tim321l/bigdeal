import { describe, expect, it } from 'vitest';
import { applyAction, initGame } from '../../src/engine/stateManager';
import type { GameEvent, GameState } from '../../src/types/game';

/** Draws, banks the first hand card (always legal regardless of what was drawn), then ends the turn. */
function scriptedTurn(state: GameState, playerId: string): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;

  const draw = applyAction(current, { type: 'DRAW', playerId });
  current = draw.nextState;
  events.push(...draw.events);

  const hand = current.players.find((p) => p.id === playerId)?.hand ?? [];
  const firstCard = hand[0];
  if (firstCard) {
    const play = applyAction(current, { type: 'PLAY_CARD', playerId, cardId: firstCard.id, asBank: true });
    current = play.nextState;
    events.push(...play.events);
  }

  const end = applyAction(current, { type: 'END_TURN', playerId });
  current = end.nextState;
  events.push(...end.events);

  return { state: current, events };
}

function activePlayerId(state: GameState): string {
  const player = state.players[state.activePlayerIndex];
  if (!player) throw new Error('no active player');
  return player.id;
}

describe('deterministic replay', () => {
  it('initGame produces an identical GameState for the same seed', () => {
    const a = initGame(['Alice', 'Bob'], 42);
    const b = initGame(['Alice', 'Bob'], 42);
    expect(a).toEqual(b);
  });

  it('produces different initial deals for different seeds', () => {
    const a = initGame(['Alice', 'Bob'], 1);
    const b = initGame(['Alice', 'Bob'], 2);
    expect(a).not.toEqual(b);
  });

  it('replays an identical action sequence to an identical final GameState', () => {
    const seed = 2024;
    const names = ['Alice', 'Bob'];

    let stateA = initGame(names, seed);
    let stateB = initGame(names, seed);
    expect(stateA).toEqual(stateB);

    for (let turn = 0; turn < 6; turn++) {
      const playerId = activePlayerId(stateA);
      const resultA = scriptedTurn(stateA, playerId);
      const resultB = scriptedTurn(stateB, playerId);

      expect(resultA.events).toEqual(resultB.events);
      expect(resultA.state).toEqual(resultB.state);

      stateA = resultA.state;
      stateB = resultB.state;
    }

    expect(stateA).toEqual(stateB);
  });

  it('resumes identically after a JSON serialize/deserialize round-trip', () => {
    const seed = 99;
    const names = ['Alice', 'Bob'];
    let live = initGame(names, seed);

    for (let turn = 0; turn < 2; turn++) {
      live = scriptedTurn(live, activePlayerId(live)).state;
    }

    const restored: GameState = JSON.parse(JSON.stringify(live));
    expect(restored).toEqual(live);

    const playerId = activePlayerId(live);
    const fromLive = scriptedTurn(live, playerId).state;
    const fromRestored = scriptedTurn(restored, playerId).state;
    expect(fromLive).toEqual(fromRestored);
  });

  it('never mutates the input state passed to applyAction (pure reducer)', () => {
    const state = initGame(['Alice', 'Bob'], 5);
    const snapshot: GameState = JSON.parse(JSON.stringify(state));

    applyAction(state, { type: 'DRAW', playerId: activePlayerId(state) });

    expect(state).toEqual(snapshot);
  });
});
