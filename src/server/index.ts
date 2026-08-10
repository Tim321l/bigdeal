import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './roomManager';
import { createSocketServer } from './socketServer';
import type { GameSocketServer, SocketServerOptions } from './socketServer';
import { serveClientAsset } from './staticClient';
import { toRoomSummary } from './types';

// Two levels up from src/server/ (dev, via tsx) or dist/server/ (prod, after tsc build) is the
// project root either way — same trick as staticClient.ts's CLIENT_DIST. The `.local` suffix
// piggybacks on the existing `*.local` gitignore rule, so this never needs its own entry.
const PASSWORD_FILE = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../.dashboard-password.local');

export { RoomManager, MIN_PLAYERS, MAX_PLAYERS } from './roomManager';
export { sanitizeStateFor } from './sanitize';
export type { SanitizedGameState, SanitizedPlayer } from './sanitize';
export { createSocketServer, type GameSocketServer, type SocketServerOptions } from './socketServer';
export * from './types';

export interface RunningServer {
  port: number;
  io: GameSocketServer;
  /** The passphrase actually in effect for the admin dashboard (see ServerOptions.dashboardPassword
   * for where it comes from) — always defined so the caller can print/log it (see main.ts). */
  dashboardPassword: string;
  close: () => Promise<void>;
}

export interface ServerOptions {
  socket?: SocketServerOptions;
  /** Passphrase required (as `Authorization: Bearer <password>`) for every /api/* admin-dashboard
   * route. See resolveDashboardPassword: defaults to DASHBOARD_PASSWORD, then a password
   * persisted in .dashboard-password.local, generating and saving a new one only if neither
   * exists yet — the dashboard is never left wide open by default, and the password stays stable
   * across restarts instead of changing every time. */
  dashboardPassword?: string;
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

/** Base32-ish (no ambiguous characters) random password, easy to read/type off a terminal —
 * mirrors src/server/roomManager.ts's room-code alphabet for the same reason. */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (const byte of bytes) out += chars[byte % chars.length];
  return out;
}

/**
 * A brand-new random password every single process start (the original behavior) turned out to
 * be more confusing than secure in practice: `tsx watch` restarting on a save, a second terminal,
 * or this session's own test/verification server all mint a *different* password, so whatever
 * you last saw printed stops working with no obvious reason why. Persisting the generated
 * password to a local file fixes that — every process on this machine reads/writes the same file,
 * so it stays stable across restarts, while an explicit DASHBOARD_PASSWORD still overrides it and
 * needs no file at all.
 */
function resolveDashboardPassword(explicit: string | undefined): string {
  if (explicit) return explicit;
  if (process.env.DASHBOARD_PASSWORD) return process.env.DASHBOARD_PASSWORD;

  try {
    const existing = readFileSync(PASSWORD_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // No file yet (first run) or unreadable — fall through and generate + (try to) persist one.
  }

  const generated = generatePassword();
  try {
    writeFileSync(PASSWORD_FILE, generated, 'utf8');
  } catch {
    // Read-only filesystem or similar — the server still works, it just won't remember this
    // password past this process, same as the old always-regenerate behavior.
  }
  return generated;
}

/** Boots the HTTP + Socket.IO server. Pass port 0 to bind an OS-assigned ephemeral port (tests). */
export function startServer(port = 3001, options: ServerOptions = {}): Promise<RunningServer> {
  return new Promise((resolve) => {
    const dashboardPassword = resolveDashboardPassword(options.dashboardPassword);
    const roomManager = new RoomManager();
    const httpServer = createHttpServer((req, res) => {
      void (async () => {
        if (req.method === 'GET' && req.url === '/healthz') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
          return;
        }

        // Admin dashboard API — gated by a passphrase (see generatePassword/DASHBOARD_PASSWORD
        // above) since it hands out every connected player's IP address and lets whoever has it
        // kick/close rooms. CORS is permissive here (matching Socket.IO's own `origin: '*'`
        // below) so the dashboard still works when Vite serves the client on a different port
        // than this server in dev; Authorization has to be explicitly allowed too, since it's
        // not one of the CORS-safelisted headers and would otherwise fail preflight.
        // This whole block must be checked before serveClientAsset below — once a client build
        // exists, its SPA fallback (any unrecognized GET path -> index.html) would otherwise
        // shadow every one of these routes, since e.g. /api/rooms doesn't correspond to a real
        // file in dist-client/.
        if (req.url?.startsWith('/api/')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          const authHeader = req.headers.authorization;
          if (authHeader !== `Bearer ${dashboardPassword}`) {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: '密碼錯誤或未輸入密碼。' }));
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

    const io = createSocketServer(httpServer, roomManager, options.socket ?? {});

    httpServer.listen(port, () => {
      const address = httpServer.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: boundPort,
        io,
        dashboardPassword,
        close: () => new Promise<void>((res, rej) => io.close((error) => (error ? rej(error) : res()))),
      });
    });
  });
}
