import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { RoomManager } from './roomManager';
import { createSocketServer } from './socketServer';
import type { GameSocketServer, SocketServerOptions } from './socketServer';
import { serveClientAsset } from './staticClient';
import { toRoomSummary } from './types';

export { RoomManager, MIN_PLAYERS, MAX_PLAYERS } from './roomManager';
export { sanitizeStateFor } from './sanitize';
export type { SanitizedGameState, SanitizedPlayer } from './sanitize';
export { createSocketServer, type GameSocketServer, type SocketServerOptions } from './socketServer';
export * from './types';

export interface RunningServer {
  port: number;
  io: GameSocketServer;
  close: () => Promise<void>;
}

/** Reads and JSON-parses a request body — raw node:http doesn't do this for you. Caps at 1MB so a
 * malformed/huge request can't hold the connection open indefinitely. Returns null on any
 * empty/invalid body rather than throwing, so callers can treat "no body" and "bad body" alike. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      raw += chunk.toString('utf8');
      if (raw.length > 1_000_000) {
        tooLarge = true;
        resolve(null);
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/** Boots the HTTP + Socket.IO server. Pass port 0 to bind an OS-assigned ephemeral port (tests). */
export function startServer(port = 3001, socketOptions: SocketServerOptions = {}): Promise<RunningServer> {
  return new Promise((resolve) => {
    const roomManager = new RoomManager();
    const httpServer = createHttpServer((req, res) => {
      void (async () => {
        if (req.method === 'GET' && req.url === '/healthz') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
          return;
        }

        // Admin dashboard API — no authentication (matches the rest of this dev-only server).
        // Don't expose this server on an untrusted network without adding one: it hands out
        // every connected player's IP address and lets anyone reachable kick/close rooms.
        // CORS is permissive here (matching Socket.IO's own `origin: '*'` below) so the dashboard
        // still works when Vite serves the client on a different port than this server in dev.
        // Must be checked before serveClientAsset below — once a client build exists, its SPA
        // fallback (any unrecognized GET path -> index.html) would otherwise shadow every one of
        // these routes, since /api/rooms doesn't correspond to a real file in dist-client/.
        if (req.url?.startsWith('/api/')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }
        }

        if (req.method === 'GET' && req.url === '/api/rooms') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(roomManager.getRoomsSummary()));
          return;
        }

        const kickMatch = req.method === 'POST' ? req.url?.match(/^\/api\/rooms\/([^/]+)\/kick$/) : null;
        if (kickMatch?.[1]) {
          const roomId = decodeURIComponent(kickMatch[1]);
          const body = await readJsonBody(req);
          const lobbyId =
            body && typeof body === 'object' && 'lobbyId' in body && typeof body.lobbyId === 'string'
              ? body.lobbyId
              : undefined;
          if (!lobbyId) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing lobbyId.' }));
            return;
          }
          const result = roomManager.kickPlayer(roomId, lobbyId);
          if (!result.ok) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }
          if (result.value.socketId) io.in(result.value.socketId).disconnectSockets(true);
          if (result.value.room) io.to(roomId).emit('room:state', toRoomSummary(result.value.room));
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        const closeMatch = req.method === 'DELETE' ? req.url?.match(/^\/api\/rooms\/([^/]+)$/) : null;
        if (closeMatch?.[1]) {
          const roomId = decodeURIComponent(closeMatch[1]);
          const result = roomManager.closeRoom(roomId);
          if (!result.ok) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }
          io.in(roomId).disconnectSockets(true);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // Once the client is built (production), the same service also serves the web app —
        // one free web service instead of juggling a separate static host + CORS.
        if (req.method === 'GET' && serveClientAsset(req, res)) return;

        res.writeHead(404);
        res.end();
      })();
    });

    const io = createSocketServer(httpServer, roomManager, socketOptions);

    httpServer.listen(port, () => {
      const address = httpServer.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: boundPort,
        io,
        close: () => new Promise<void>((res, rej) => io.close((error) => (error ? rej(error) : res()))),
      });
    });
  });
}
