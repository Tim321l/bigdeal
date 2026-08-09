import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ActionPayload, GameEvent } from '../types/game';
import { RoomManager } from './roomManager';
import { sanitizeStateFor } from './sanitize';
import { toRoomSummary } from './types';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

const ACTION_TYPES = new Set(['DRAW', 'PLAY_CARD', 'RESPOND', 'END_TURN']);

function isValidActionPayload(data: unknown): data is ActionPayload {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.type === 'string' && ACTION_TYPES.has(candidate.type) && typeof candidate.playerId === 'string';
}

interface SocketSession {
  roomId: string;
  lobbyId: string;
}

export type GameSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(httpServer: HttpServer, roomManager: RoomManager = new RoomManager()): GameSocketServer {
  const io: GameSocketServer = new Server(httpServer, {
    // Permissive for local development; tighten before deploying behind a real origin.
    cors: { origin: '*' },
  });

  const sessions = new Map<string, SocketSession>();

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
  }

  // processBotTurns caps how much work it does in one call so a degenerate room (e.g. every
  // player just drawing 0 cards and ending their turn, in an exhausted-deck stretch) can't block
  // the event loop for other rooms. Without resuming it, hitting that cap mid-bot-rotation left
  // the game stuck forever on a bot's turn with nothing left to ever trigger another attempt —
  // the client would just wait indefinitely for a turn that never came back around.
  const MAX_BOT_CONTINUATION_CHAIN = 200;

  /** Lets every bot whose turn it now is play out, resuming itself until a human needs to act
   * or the game ends, then broadcasts everything that happened. */
  function runBotsAndBroadcast(roomId: string, precedingEvents: GameEvent[] = [], chain = 0): void {
    const botEvents = roomManager.processBotTurns(roomId);
    const events = [...precedingEvents, ...botEvents];
    if (events.length > 0) io.to(roomId).emit('game:events', events);
    broadcastGameState(roomId);

    if (roomManager.isBotTurn(roomId) && chain < MAX_BOT_CONTINUATION_CHAIN) {
      setTimeout(() => runBotsAndBroadcast(roomId, [], chain + 1), 10);
    }
  }

  io.on('connection', (socket) => {
    socket.on('room:create', ({ playerName }, ack) => {
      const result = roomManager.createRoom(playerName, socket.id);
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
      const result = roomManager.joinRoom(roomId, playerName, socket.id);
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
      const result = roomManager.reconnect(roomId, lobbyId, reconnectToken, socket.id);
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

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      sessions.delete(socket.id);
      const result = roomManager.disconnectSocket(session.roomId, session.lobbyId);
      if (result.ok) broadcastRoomSummary(session.roomId);
    });
  });

  return io;
}
