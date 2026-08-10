import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ActionPayload, GameEvent } from '../types/game';
import { RoomManager } from './roomManager';
import { sanitizeStateFor } from './sanitize';
import { toRoomSummary } from './types';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

// A Record keyed by every ActionPayload['type'] instead of a bare Set<string> — if a new action
// variant is ever added to ActionPayload without a matching entry here, this fails to typecheck
// (missing property) instead of silently rejecting that action at runtime as "Malformed action."
// GIFT_CARD shipped broken for exactly this reason: a hand-maintained Set never got updated.
const ACTION_TYPE_SET: Record<ActionPayload['type'], true> = {
  DRAW: true,
  PLAY_CARD: true,
  RESPOND: true,
  END_TURN: true,
  GIFT_CARD: true,
  SUBMIT_BID: true,
  ROLL_DICE: true,
  BUY_TILE: true,
  DECLINE_TILE: true,
  TELEPORT_TRANSIT: true,
  COLLECT_TRANSIT_RENT: true,
  SKIP_TILE_DECISION: true,
};

function isValidActionPayload(data: unknown): data is ActionPayload {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    Object.hasOwn(ACTION_TYPE_SET, candidate.type) &&
    typeof candidate.playerId === 'string'
  );
}

interface SocketSession {
  roomId: string;
  lobbyId: string;
}

/** Never matches a real GameState player id (those are always `player-N`) — sanitizeStateFor
 * hides every hand when nothing matches, which is exactly the view a spectator should get. */
const SPECTATOR_VIEWER_ID = '__spectator__';

export type GameSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface SocketServerOptions {
  /** Delay between each individual bot action broadcast, so a human watching can actually follow
   * along instead of an entire bot turn resolving instantly. Defaults to a human-legible pace;
   * tests that drive a full bot-vs-human game over the wire pass 0 so they don't take minutes. */
  botStepDelayMs?: number;
}

export function createSocketServer(
  httpServer: HttpServer,
  roomManager: RoomManager,
  options: SocketServerOptions = {},
): GameSocketServer {
  const botStepDelayMs = options.botStepDelayMs ?? 700;
  const io: GameSocketServer = new Server(httpServer, {
    // Permissive for local development; tighten before deploying behind a real origin.
    cors: { origin: '*' },
  });

  const sessions = new Map<string, SocketSession>();
  /** Spectator sockets, keyed by socket id — separate from `sessions` since a spectator never
   * holds a lobbyId (no seat, no reconnect concept). */
  const spectatorSessions = new Map<string, string>(); // socketId -> roomId

  function broadcastRoomSummary(roomId: string): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    io.to(roomId).emit('room:state', toRoomSummary(room));
  }

  function broadcastGameState(roomId: string): void {
    const room = roomManager.getRoom(roomId);
    if (!room?.gameState) return;
    for (const player of room.players) {
      if (!player.connected || !player.socketId || !player.gamePlayerId) continue;
      io.to(player.socketId).emit('game:state', sanitizeStateFor(room.gameState, player.gamePlayerId));
    }
    if (room.spectatorSocketIds.size > 0) {
      const spectatorView = sanitizeStateFor(room.gameState, SPECTATOR_VIEWER_ID);
      for (const socketId of room.spectatorSocketIds) {
        io.to(socketId).emit('game:state', spectatorView);
      }
    }
  }

  // A human watching bot turns needs each individual action paced and broadcast on its own —
  // resolving an entire bot rotation in one instant, unpaced burst (the old behavior) made it
  // impossible to follow what just happened. This caps how many steps one continuation chain
  // will take (matching processBotTurns' own MAX_BOT_STEPS bound) so a degenerate room (e.g.
  // every player just drawing 0 cards in an exhausted-deck stretch) can't pace forever.
  const MAX_BOT_CONTINUATION_CHAIN = 500;

  /** Broadcasts precedingEvents (typically the human action that just triggered this bot
   * rotation) and the resulting state — unconditionally, since this is also what pushes the very
   * first game:state out when a game starts with no bots at all and nothing else ever would —
   * then steps through every bot decision that follows one at a time, each on its own timer and
   * its own broadcast, until a human needs to act or the game ends. */
  function runBotsAndBroadcast(roomId: string, precedingEvents: GameEvent[] = []): void {
    if (precedingEvents.length > 0) io.to(roomId).emit('game:events', precedingEvents);
    broadcastGameState(roomId);
    scheduleNextBotStep(roomId, 0);
  }

  function scheduleNextBotStep(roomId: string, chain: number): void {
    if (!roomManager.isBotTurn(roomId) || chain >= MAX_BOT_CONTINUATION_CHAIN) return;
    setTimeout(() => {
      const events = roomManager.processSingleBotStep(roomId);
      if (events && events.length > 0) io.to(roomId).emit('game:events', events);
      broadcastGameState(roomId);
      scheduleNextBotStep(roomId, chain + 1);
    }, botStepDelayMs);
  }

  io.on('connection', (socket) => {
    socket.on('room:create', ({ playerName }, ack) => {
      const result = roomManager.createRoom(playerName, socket.id, socket.handshake.address);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      const { room, lobbyId, reconnectToken } = result.value;
      sessions.set(socket.id, { roomId: room.id, lobbyId });
      void socket.join(room.id);
      ack({ ok: true, data: { roomId: room.id, lobbyId, reconnectToken } });
      broadcastRoomSummary(room.id);
    });

    socket.on('room:join', ({ roomId, playerName }, ack) => {
      const result = roomManager.joinRoom(roomId, playerName, socket.id, socket.handshake.address);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      const { room, lobbyId, reconnectToken } = result.value;
      sessions.set(socket.id, { roomId: room.id, lobbyId });
      void socket.join(room.id);
      ack({ ok: true, data: { roomId: room.id, lobbyId, reconnectToken } });
      broadcastRoomSummary(room.id);
    });

    socket.on('room:reconnect', ({ roomId, lobbyId, reconnectToken }, ack) => {
      const result = roomManager.reconnect(roomId, lobbyId, reconnectToken, socket.id, socket.handshake.address);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      sessions.set(socket.id, { roomId, lobbyId });
      void socket.join(roomId);
      ack({ ok: true, data: {} });
      broadcastRoomSummary(roomId);
      broadcastGameState(roomId);
    });

    socket.on('room:ready', ({ ready }, ack) => {
      const session = sessions.get(socket.id);
      if (!session) {
        ack({ ok: false, error: 'Join a room first.' });
        return;
      }
      const result = roomManager.setReady(session.roomId, session.lobbyId, ready);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      ack({ ok: true, data: { started: result.value.started } });
      broadcastRoomSummary(session.roomId);
      if (result.value.started) runBotsAndBroadcast(session.roomId);
    });

    socket.on('room:setMode', ({ mode }, ack) => {
      const session = sessions.get(socket.id);
      if (!session) {
        ack({ ok: false, error: 'Join a room first.' });
        return;
      }
      const result = roomManager.setMode(session.roomId, session.lobbyId, mode);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      ack({ ok: true, data: {} });
      broadcastRoomSummary(session.roomId);
    });

    socket.on('room:addBot', ({ level }, ack) => {
      const session = sessions.get(socket.id);
      if (!session) {
        ack({ ok: false, error: 'Join a room first.' });
        return;
      }
      const result = roomManager.addBot(session.roomId, session.lobbyId, level);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      ack({ ok: true, data: {} });
      broadcastRoomSummary(session.roomId);
    });

    socket.on('room:removeBot', ({ botLobbyId }, ack) => {
      const session = sessions.get(socket.id);
      if (!session) {
        ack({ ok: false, error: 'Join a room first.' });
        return;
      }
      const result = roomManager.removeBot(session.roomId, session.lobbyId, botLobbyId);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      ack({ ok: true, data: {} });
      broadcastRoomSummary(session.roomId);
    });

    socket.on('game:intent', ({ action }, ack) => {
      const session = sessions.get(socket.id);
      if (!session) {
        ack({ ok: false, error: 'Join a room first.' });
        return;
      }
      if (!isValidActionPayload(action)) {
        ack({ ok: false, error: 'Malformed action.' });
        return;
      }

      const result = roomManager.submitIntent(session.roomId, session.lobbyId, action);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      ack({ ok: true, data: {} });
      runBotsAndBroadcast(session.roomId, result.value.events);
    });

    socket.on('room:spectate', ({ roomId }, ack) => {
      const result = roomManager.spectate(roomId, socket.id);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      spectatorSessions.set(socket.id, roomId);
      void socket.join(roomId);
      ack({ ok: true, data: {} });
      broadcastRoomSummary(roomId);
      broadcastGameState(roomId);
    });

    socket.on('room:history', ({ roomId }, ack) => {
      const result = roomManager.getHistory(roomId);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }
      ack({ ok: true, data: { history: result.value.history } });
    });

    socket.on('disconnect', () => {
      const spectatingRoomId = spectatorSessions.get(socket.id);
      if (spectatingRoomId) {
        spectatorSessions.delete(socket.id);
        roomManager.unspectate(spectatingRoomId, socket.id);
        broadcastRoomSummary(spectatingRoomId);
      }

      const session = sessions.get(socket.id);
      if (!session) return;
      sessions.delete(socket.id);
      const result = roomManager.disconnectSocket(session.roomId, session.lobbyId);
      if (result.ok) broadcastRoomSummary(session.roomId);
    });
  });

  return io;
}
