import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, GO_BONUS } from '../../src/data/board';
import { applyAction, initGame } from '../../src/engine/stateManager';
import { PRNG } from '../../src/engine/prng';
import { checkWinner } from '../../src/engine/winCondition';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

// Fixed board layout (src/data/board.ts). Picked comfortably far from GO (position 0) so that
// `positionBeforeRoll` below never has to wrap around past GO for a 1-6 roll — landing near GO
// would otherwise silently grant a pass-go bonus and contaminate these tests' bank assertions.
const PROPERTY_TILE = 10; // tong-lau-nga-tsin-wai-road (OLD_TONG_LAU, value $2M)
const STORM_TILE = 20;
const AUCTION_TILE = 12;
const TRANSPORT_TILE = 27;

/** Computes the roll a given seed will actually produce, then backs out the start position that
 * lands exactly on `targetPosition` — deterministic and seed-agnostic, no guessing required. */
function positionBeforeRoll(seed: number, targetPosition: number): number {
  const roll = new PRNG(seed).nextInt(1, 6);
  return (targetPosition - roll + BOARD_SIZE) % BOARD_SIZE;
}

describe('REAL_BIG_DEAL mode', () => {
  it('initGame starts everyone at position 0, phase ROLL, and excludes PROPERTY cards from the deck', () => {
    const state = initGame(['Alice', 'Bob'], 1, 'REAL_BIG_DEAL');
    expect(state.phase).toBe('ROLL');
    expect(state.players.every((p) => p.position === 0)).toBe(true);
    expect(state.deck.every((c) => c.type !== 'PROPERTY')).toBe(true);
  });

  it('CLASSIC mode deck still includes PROPERTY cards (regression guard)', () => {
    const state = initGame(['Alice', 'Bob'], 1, 'CLASSIC');
    expect(state.deck.some((c) => c.type === 'PROPERTY')).toBe(true);
  });

  it('rolling moves the active player and reports the move', () => {
    const seed = 42;
    const alice = makePlayer('player-1', 'Alice', { position: 0 });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const { nextState, events } = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    const rollEvent = events.find((e) => e.type === 'DICE_ROLLED');
    expect(rollEvent).toBeDefined();
    if (rollEvent?.type === 'DICE_ROLLED') {
      expect(nextState.players[0]?.position).toBe(rollEvent.toPosition);
      expect(rollEvent.roll).toBeGreaterThanOrEqual(1);
      expect(rollEvent.roll).toBeLessThanOrEqual(6);
    }
  });

  it('only the active player may roll, and only during the ROLL phase', () => {
    const alice = makePlayer('player-1', 'Alice', { position: 0 });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob] });

    const wrongPlayer = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-2' });
    expect(wrongPlayer.events).toContainEqual({ type: 'INVALID_ACTION', reason: 'Only the active player may roll.' });

    const wrongPhase = applyAction({ ...state, phase: 'TURN_START' }, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(wrongPhase.events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
  });

  it('landing on or passing GO grants the pass-go bonus', () => {
    const seed = 7;
    const roll = new PRNG(seed).nextInt(1, 6);
    const alice = makePlayer('player-1', 'Alice', { position: BOARD_SIZE - roll }); // lands exactly on GO (position 0)
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const { nextState, events } = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(events).toContainEqual({ type: 'PASSED_GO', playerId: 'player-1', amount: GO_BONUS });
    expect(nextState.players[0]?.bank.reduce((s, c) => s + c.value, 0)).toBe(GO_BONUS);
    expect(nextState.players[0]?.position).toBe(0);
    expect(nextState.phase).toBe('TURN_START');
  });

  it('landing on an unowned property opens a TILE_DECISION, and BUY_TILE purchases it with bank cash', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, PROPERTY_TILE);
    const alice = makePlayer('player-1', 'Alice', { position: startPosition, bank: [cardById('money-4m-a')] });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const rolled = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(rolled.nextState.phase).toBe('TILE_DECISION');
    expect(rolled.nextState.pendingTileDecision).toEqual({
      playerId: 'player-1',
      tileIndex: PROPERTY_TILE,
      kind: 'BUY_PROPERTY',
      price: 2,
    });

    const bought = applyAction(rolled.nextState, { type: 'BUY_TILE', playerId: 'player-1' });
    expect(bought.events).toContainEqual({ type: 'TILE_PURCHASED', playerId: 'player-1', tileIndex: PROPERTY_TILE, price: 2 });
    expect(bought.nextState.players[0]?.field.OLD_TONG_LAU.some((c) => c.id === 'tong-lau-nga-tsin-wai-road')).toBe(true);
    // No change-making anywhere in this codebase (matches chargePlayer/resolveAuction) — paying a
    // $2M debt with only a $4M bill spends the whole bill, same as every other charge in the game.
    expect(bought.nextState.players[0]?.bank).toHaveLength(0);
    expect(bought.nextState.phase).toBe('TURN_START');
    expect(bought.nextState.pendingTileDecision).toBeUndefined();
  });

  it('DECLINE_TILE leaves the tile unowned and moves on', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, PROPERTY_TILE);
    const alice = makePlayer('player-1', 'Alice', { position: startPosition });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const rolled = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    const declined = applyAction(rolled.nextState, { type: 'DECLINE_TILE', playerId: 'player-1' });
    expect(declined.events).toContainEqual({ type: 'TILE_DECLINED', playerId: 'player-1', tileIndex: PROPERTY_TILE });
    expect(declined.nextState.players[0]?.field.OLD_TONG_LAU).toHaveLength(0);
    expect(declined.nextState.phase).toBe('TURN_START');
  });

  it('landing on your own tile is a no-op', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, PROPERTY_TILE);
    const alice = makePlayer('player-1', 'Alice', {
      position: startPosition,
      field: { ...makeField(), OLD_TONG_LAU: [cardById('tong-lau-nga-tsin-wai-road')] },
    });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const { nextState } = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(nextState.phase).toBe('TURN_START');
    expect(nextState.pendingTileDecision).toBeUndefined();
  });

  it('landing on an opponent-owned tile opens a REACTION_WINDOW for board rent, defendable with 封區, returning to TURN_START', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, PROPERTY_TILE);
    const justSayNo = cardById('action-just-say-no');
    const alice = makePlayer('player-1', 'Alice', { position: startPosition, hand: [justSayNo] });
    const bob = makePlayer('player-2', 'Bob', {
      position: 0,
      field: { ...makeField(), OLD_TONG_LAU: [cardById('tong-lau-nga-tsin-wai-road')] },
    });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const rolled = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(rolled.nextState.phase).toBe('REACTION_WINDOW');
    expect(rolled.nextState.pendingReaction?.sourcePlayerId).toBe('player-2');
    expect(rolled.nextState.pendingReaction?.currentResponderId).toBe('player-1');
    expect(rolled.nextState.pendingReaction?.returnPhase).toBe('TURN_START');

    const blocked = applyAction(rolled.nextState, { type: 'RESPOND', playerId: 'player-1', response: 'JUST_SAY_NO' });
    const accepted = applyAction(blocked.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });
    expect(accepted.nextState.phase).toBe('TURN_START');
    expect(accepted.nextState.players[0]?.bank).toHaveLength(0); // blocked — nothing charged
  });

  it('paying uncontested board rent transfers cash and returns to TURN_START (not ACTION)', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, PROPERTY_TILE);
    const alice = makePlayer('player-1', 'Alice', { position: startPosition, bank: [cardById('money-4m-a')] });
    const bob = makePlayer('player-2', 'Bob', {
      position: 0,
      field: { ...makeField(), OLD_TONG_LAU: [cardById('tong-lau-nga-tsin-wai-road')] },
    });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const rolled = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    const paid = applyAction(rolled.nextState, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });
    expect(paid.nextState.phase).toBe('TURN_START');
    expect(paid.nextState.players[1]?.bank.some((c) => c.id === 'money-4m-a')).toBe(true);
  });

  it('landing on the AUCTION tile opens a spontaneous blind auction (reuses the existing AUCTION phase)', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, AUCTION_TILE);
    const alice = makePlayer('player-1', 'Alice', { position: startPosition });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({
      mode: 'REAL_BIG_DEAL',
      phase: 'ROLL',
      players: [alice, bob],
      rngSeed: seed,
      deck: [cardById('money-1m-a'), cardById('money-1m-b'), cardById('money-1m-c')],
    });

    const { nextState, events } = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(nextState.phase).toBe('AUCTION');
    expect(nextState.pendingAuction?.cards).toHaveLength(3);
    expect(events.some((e) => e.type === 'AUCTION_STARTED')).toBe(true);
  });

  it('landing on the STORM tile force-triggers a macro event', () => {
    const seed = 999; // wouldn't trigger under the normal 30% roll on a single check
    const startPosition = positionBeforeRoll(seed, STORM_TILE);
    const alice = makePlayer('player-1', 'Alice', { position: startPosition });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const { nextState, events } = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(events.some((e) => e.type === 'MACRO_EVENT_TRIGGERED')).toBe(true);
    expect(nextState.phase).toBe('TURN_START');
  });

  it('landing on an unowned TRANSPORT tile: buying it opens a follow-up TRANSIT decision', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, TRANSPORT_TILE);
    const alice = makePlayer('player-1', 'Alice', { position: startPosition, bank: [cardById('money-4m-a')] });
    const bob = makePlayer('player-2', 'Bob', { position: 0 });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const rolled = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    expect(rolled.nextState.pendingTileDecision?.kind).toBe('BUY_PROPERTY');

    const bought = applyAction(rolled.nextState, { type: 'BUY_TILE', playerId: 'player-1' });
    expect(bought.nextState.phase).toBe('TILE_DECISION');
    expect(bought.nextState.pendingTileDecision?.kind).toBe('TRANSIT');

    const skipped = applyAction(bought.nextState, { type: 'SKIP_TILE_DECISION', playerId: 'player-1' });
    expect(skipped.nextState.phase).toBe('TURN_START');
  });

  it('collecting transit rent charges every opponent and requires owning a transit tile first', () => {
    const alice = makePlayer('player-1', 'Alice', {
      field: { ...makeField(), TRANSPORT: [cardById('transport-island-line')] },
    });
    const bob = makePlayer('player-2', 'Bob', { bank: [cardById('money-4m-a')] });
    const state = makeState({
      mode: 'REAL_BIG_DEAL',
      phase: 'TILE_DECISION',
      players: [alice, bob],
      pendingTileDecision: { playerId: 'player-1', tileIndex: TRANSPORT_TILE, kind: 'TRANSIT' },
    });

    const { nextState, events } = applyAction(state, { type: 'COLLECT_TRANSIT_RENT', playerId: 'player-1' });
    expect(events.some((e) => e.type === 'RENT_CHARGED')).toBe(true);
    expect(nextState.players[0]?.bank.length).toBeGreaterThan(0);
    expect(nextState.phase).toBe('TURN_START');

    const noTransit = makeState({
      mode: 'REAL_BIG_DEAL',
      phase: 'TILE_DECISION',
      players: [makePlayer('player-1', 'Alice'), makePlayer('player-2', 'Bob')],
      pendingTileDecision: { playerId: 'player-1', tileIndex: TRANSPORT_TILE, kind: 'TRANSIT' },
    });
    const rejected = applyAction(noTransit, { type: 'COLLECT_TRANSIT_RENT', playerId: 'player-1' });
    expect(rejected.events).toContainEqual({
      type: 'INVALID_ACTION',
      reason: 'You do not own any transit tiles to collect rent for.',
    });
  });

  it('teleporting moves to a different transit tile without finalizing the decision', () => {
    const alice = makePlayer('player-1', 'Alice', { position: TRANSPORT_TILE });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({
      mode: 'REAL_BIG_DEAL',
      phase: 'TILE_DECISION',
      players: [alice, bob],
      pendingTileDecision: { playerId: 'player-1', tileIndex: TRANSPORT_TILE, kind: 'TRANSIT' },
    });

    const otherTransitTile = TRANSPORT_TILE + 1; // transport-interchange-station
    const { nextState } = applyAction(state, { type: 'TELEPORT_TRANSIT', playerId: 'player-1', toPosition: otherTransitTile });
    expect(nextState.players[0]?.position).toBe(otherTransitTile);
    expect(nextState.phase).toBe('TILE_DECISION'); // still pending — can still collect rent or skip
  });

  it('bankruptcy from board rent eliminates the payer and transfers their tiles to the collector', () => {
    const seed = 13;
    const startPosition = positionBeforeRoll(seed, PROPERTY_TILE);
    // Alice owns nothing and has no cash in hand or bank — can't cover even a $1M rent charge.
    const alice = makePlayer('player-1', 'Alice', { position: startPosition });
    const bob = makePlayer('player-2', 'Bob', {
      position: 0,
      field: { ...makeField(), OLD_TONG_LAU: [cardById('tong-lau-nga-tsin-wai-road')] },
    });
    const state = makeState({ mode: 'REAL_BIG_DEAL', phase: 'ROLL', players: [alice, bob], rngSeed: seed });

    const rolled = applyAction(state, { type: 'ROLL_DICE', playerId: 'player-1' });
    const paid = applyAction(rolled.nextState, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });
    expect(paid.events).toContainEqual({ type: 'PLAYER_ELIMINATED', playerId: 'player-1', collectorId: 'player-2' });
    expect(paid.nextState.players[0]?.eliminated).toBe(true);
  });

  it('wins on 3 complete sets or by bankrupting every other player, whichever comes first', () => {
    const winByThreeSets = makeState({
      mode: 'REAL_BIG_DEAL',
      players: [
        makePlayer('player-1', 'Alice', {
          field: {
            PUBLIC_HOUSING: [cardById('public-housing-tin-shing-yuen'), cardById('public-housing-yau-oi-estate'), cardById('public-housing-ngau-tau-kok-lower-estate')],
            OLD_TONG_LAU: [cardById('tong-lau-apliu-street'), cardById('tong-lau-ladies-market'), cardById('tong-lau-nga-tsin-wai-road')],
            ESTATE: [cardById('estate-taikoo-shing'), cardById('estate-mei-foo-sun-chuen'), cardById('estate-city-one')],
            COMMERCIAL_LUXURY: [],
            TRANSPORT: [],
          },
        }),
        makePlayer('player-2', 'Bob'),
      ],
    });
    expect(checkWinner(winByThreeSets)).toBe('player-1');

    const winByBankruptcy = makeState({
      mode: 'REAL_BIG_DEAL',
      players: [makePlayer('player-1', 'Alice'), makePlayer('player-2', 'Bob', { eliminated: true })],
    });
    expect(checkWinner(winByBankruptcy)).toBe('player-1');
  });

  it('does not use REAL_BIG_DEAL win conditions in CLASSIC mode', () => {
    const state = makeState({
      mode: 'CLASSIC',
      players: [makePlayer('player-1', 'Alice'), makePlayer('player-2', 'Bob', { eliminated: true })],
    });
    expect(checkWinner(state)).toBeUndefined();
  });
});
