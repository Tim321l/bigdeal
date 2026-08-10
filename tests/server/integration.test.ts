import { type Socket, io as ioClient } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type RunningServer, startServer } from '../../src/server/index';
import type { SanitizedGameState } from '../../src/server/sanitize';
import type { AckResult, ClientToServerEvents, JoinAckData, RoomSummary, ServerToClientEvents } from '../../src/server/types';
import type { ActionPayload, GameEvent } from '../../src/types/game';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: RunningServer;
let baseUrl: string;

beforeAll(async () => {
  // Real play paces each bot action for legibility (see socketServer.ts) — tests want the
  // fastest bot-vs-human game they can get instead.
  server = await startServer(0, { botStepDelayMs: 0 });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const socket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
  });
}

function waitForRoomState(socket: ClientSocket): Promise<RoomSummary> {
  return new Promise((resolve) => socket.once('room:state', resolve));
}

function waitForGameState(socket: ClientSocket): Promise<SanitizedGameState> {
  return new Promise((resolve) => socket.once('game:state', resolve));
}

/** Bot turns now broadcast one game:state per individual bot action (paced for legibility — see
 * socketServer.ts) instead of one state per whole bot rotation, so waiting for the *first*
 * game:state after a hand-off to bots would just catch it mid-turn. This waits for the first one
 * matching a predicate instead, e.g. "it's the human's turn again." */
function waitForGameStateWhere(socket: ClientSocket, predicate: (state: SanitizedGameState) => boolean): Promise<SanitizedGameState> {
  return new Promise((resolve) => {
    const handler = (state: SanitizedGameState): void => {
      if (!predicate(state)) return;
      socket.off('game:state', handler);
      resolve(state);
    };
    socket.on('game:state', handler);
  });
}

function waitForGameEvents(socket: ClientSocket): Promise<GameEvent[]> {
  return new Promise((resolve) => socket.once('game:events', resolve));
}

function createRoom(socket: ClientSocket, playerName: string): Promise<AckResult<JoinAckData>> {
  return new Promise((resolve) => socket.emit('room:create', { playerName }, resolve));
}

function joinRoom(socket: ClientSocket, roomId: string, playerName: string): Promise<AckResult<JoinAckData>> {
  return new Promise((resolve) => socket.emit('room:join', { roomId, playerName }, resolve));
}

function setReady(socket: ClientSocket, ready: boolean): Promise<AckResult<{ started: boolean }>> {
  return new Promise((resolve) => socket.emit('room:ready', { ready }, resolve));
}

function sendIntent(socket: ClientSocket, action: ActionPayload): Promise<AckResult<Record<string, never>>> {
  return new Promise((resolve) => socket.emit('game:intent', { action }, resolve));
}

function reconnectRoom(
  socket: ClientSocket,
  roomId: string,
  lobbyId: string,
  reconnectToken: string,
): Promise<AckResult<Record<string, never>>> {
  return new Promise((resolve) => socket.emit('room:reconnect', { roomId, lobbyId, reconnectToken }, resolve));
}

function addBot(socket: ClientSocket, level: 1 | 2 | 3): Promise<AckResult<Record<string, never>>> {
  return new Promise((resolve) => socket.emit('room:addBot', { level }, resolve));
}

describe('multiplayer room + game wire protocol', () => {
  it(
    'runs a full lobby -> auto-start -> sanitized state -> intent -> impersonation -> disconnect/reconnect flow',
    async () => {
      const clientA = await connectClient();
      const clientB = await connectClient();

      const created = await createRoom(clientA, 'Alice');
      if (!created.ok) throw new Error(created.error);
      const { roomId, lobbyId: lobbyIdA, reconnectToken: tokenA } = created.data;

      const roomStateAfterJoin = waitForRoomState(clientA);
      const joined = await joinRoom(clientB, roomId, 'Bob');
      if (!joined.ok) throw new Error(joined.error);
      const { lobbyId: lobbyIdB } = joined.data;
      expect((await roomStateAfterJoin).players).toHaveLength(2);

      // Ready check: the game must not start until every seated player is ready.
      const notStarted = await setReady(clientA, true);
      expect(notStarted).toEqual({ ok: true, data: { started: false } });

      const gameStateA = waitForGameState(clientA);
      const gameStateB = waitForGameState(clientB);
      const started = await setReady(clientB, true);
      expect(started).toEqual({ ok: true, data: { started: true } });

      const stateA = await gameStateA;
      const stateB = await gameStateB;

      // --- State sanitization: each socket sees its own hand, only a count for the other. ---
      const selfA = stateA.players.find((p) => p.id === stateA.viewerPlayerId)!;
      const otherA = stateA.players.find((p) => p.id !== stateA.viewerPlayerId)!;
      expect(selfA.hand).toHaveLength(5);
      expect(otherA.hand).toBeUndefined();
      expect(otherA.handCount).toBe(5);
      expect((stateA as unknown as Record<string, unknown>).rngSeed).toBeUndefined();
      expect((stateA as unknown as Record<string, unknown>).deck).toBeUndefined();
      expect(stateA.deckCount).toBeGreaterThan(0);

      // Alice (host, joined first) is always player-1 and always starts.
      expect(stateA.viewerPlayerId).toBe('player-1');
      expect(stateB.viewerPlayerId).toBe('player-2');
      expect(stateA.activePlayerIndex).toBe(0);

      // --- Message routing: Alice's DRAW is validated server-side and broadcast to Bob. ---
      const eventsOnB = waitForGameEvents(clientB);
      const postDrawStateA = waitForGameState(clientA);
      const drawResult = await sendIntent(clientA, { type: 'DRAW', playerId: 'player-1' });
      expect(drawResult).toEqual({ ok: true, data: {} });

      const broadcastEvents = await eventsOnB;
      expect(broadcastEvents).toContainEqual(
        expect.objectContaining({ type: 'CARDS_DRAWN', playerId: 'player-1' }),
      );
      const stateAAfterDraw = await postDrawStateA;
      const selfAAfterDraw = stateAAfterDraw.players.find((p) => p.id === 'player-1')!;
      expect(selfAAfterDraw.hand!.length).toBeGreaterThanOrEqual(selfA.hand!.length);

      // --- Security: Bob cannot submit an action pretending to be Alice. ---
      const impersonation = await sendIntent(clientB, { type: 'DRAW', playerId: 'player-1' });
      expect(impersonation).toEqual({ ok: false, error: 'You may only act as your own player.' });

      // --- Disconnect: Bob observes Alice going offline, her seat is preserved. ---
      const roomStateAfterDisconnect = waitForRoomState(clientB);
      clientA.disconnect();
      const afterDisconnect = await roomStateAfterDisconnect;
      const aliceEntry = afterDisconnect.players.find((p) => p.lobbyId === lobbyIdA);
      expect(aliceEntry?.connected).toBe(false);

      // --- Reconnect: a new socket reclaims Alice's seat with the correct token and resyncs her hand. ---
      const clientA2 = await connectClient();
      const resyncState = waitForGameState(clientA2);
      const reconnectResult = await reconnectRoom(clientA2, roomId, lobbyIdA, tokenA);
      expect(reconnectResult).toEqual({ ok: true, data: {} });

      const resynced = await resyncState;
      const selfA2 = resynced.players.find((p) => p.id === 'player-1')!;
      expect([...selfA2.hand!.map((c) => c.id)].sort()).toEqual(
        [...selfAAfterDraw.hand!.map((c) => c.id)].sort(),
      );
      // Bob still only ever sees a count for Alice's hand, even after her reconnect.
      const otherA2 = resynced.players.find((p) => p.id === 'player-2')!;
      expect(otherA2.hand).toBeUndefined();

      clientA2.disconnect();
      clientB.disconnect();
      void lobbyIdB; // captured for symmetry with lobbyIdA; not otherwise asserted in this flow
    },
    15000,
  );

  it('rejects a reconnect attempt with the wrong token', async () => {
    const host = await connectClient();
    const created = await createRoom(host, 'Solo Host');
    if (!created.ok) throw new Error(created.error);

    const impostor = await connectClient();
    const result = await reconnectRoom(impostor, created.data.roomId, created.data.lobbyId, 'wrong-token');
    expect(result).toEqual({ ok: false, error: 'Invalid reconnect token.' });

    host.disconnect();
    impostor.disconnect();
  });

  it('rejects a malformed game:intent payload', async () => {
    const host = await connectClient();
    const created = await createRoom(host, 'Solo Host 2');
    if (!created.ok) throw new Error(created.error);

    const result = await sendIntent(host, { type: 'NOT_A_REAL_TYPE' } as unknown as ActionPayload);
    expect(result).toEqual({ ok: false, error: 'Malformed action.' });

    host.disconnect();
  });

  it(
    'lets a solo human play against bots, which act on their own over the wire',
    async () => {
      const human = await connectClient();
      const created = await createRoom(human, 'Solo Human');
      if (!created.ok) throw new Error(created.error);

      const addedBot = await addBot(human, 1);
      expect(addedBot.ok).toBe(true);

      const gameStateOnStart = waitForGameState(human);
      const readyResult = await setReady(human, true);
      expect(readyResult).toEqual({ ok: true, data: { started: true } });

      const initial = await gameStateOnStart;
      expect(initial.viewerPlayerId).toBe('player-1');
      expect(initial.players[1]?.name).toContain('機械人');

      // The human draws and ends their turn; the bot should then play its whole turn
      // automatically and hand control back, all without the human doing anything else.
      // A random macro event (e.g. 八號風球/停牌一日's SKIP_TURN) can end the human's turn as a
      // side effect of DRAW itself, before the explicit END_TURN call even runs — so TURN_ENDED
      // for player-1 might land in either batch. Capture both rather than assuming which.
      const eventsFromDraw = waitForGameEvents(human);
      await sendIntent(human, { type: 'DRAW', playerId: 'player-1' });

      const eventsFromEndTurnOnward = waitForGameEvents(human);
      // Bot actions now broadcast one game:state each as they're paced out, so this waits for
      // the one where control has actually come back around to the human, not just the first
      // state update after handing off to the bot.
      const stateBackToHuman = waitForGameStateWhere(human, (state) => state.activePlayerIndex === 0);
      await sendIntent(human, { type: 'END_TURN', playerId: 'player-1' });

      const events = [...(await eventsFromDraw), ...(await eventsFromEndTurnOnward)];
      expect(events.some((e) => e.type === 'TURN_ENDED' && e.playerId === 'player-1')).toBe(true);

      const resumed = await stateBackToHuman;
      expect(resumed.activePlayerIndex).toBe(0);
      expect(resumed.turn).toBeGreaterThanOrEqual(2);

      human.disconnect();
    },
    15000,
  );
});
