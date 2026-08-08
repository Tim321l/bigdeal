import { createServer as createHttpServer } from 'node:http';
import { createSocketServer } from './socketServer';
import type { GameSocketServer } from './socketServer';
import { serveClientAsset } from './staticClient';

export { RoomManager, MIN_PLAYERS, MAX_PLAYERS } from './roomManager';
export { sanitizeStateFor } from './sanitize';
export type { SanitizedGameState, SanitizedPlayer } from './sanitize';
export { createSocketServer, type GameSocketServer } from './socketServer';
export * from './types';

export interface RunningServer {
  port: number;
  io: GameSocketServer;
  close: () => Promise<void>;
}

/** Boots the HTTP + Socket.IO server. Pass port 0 to bind an OS-assigned ephemeral port (tests). */
export function startServer(port = 3001): Promise<RunningServer> {
  return new Promise((resolve) => {
    const httpServer = createHttpServer((req, res) => {
      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }
      // Once the client is built (production), the same service also serves the web app —
      // one free web service instead of juggling a separate static host + CORS.
      if (req.method === 'GET' && serveClientAsset(req, res)) return;
      res.writeHead(404);
      res.end();
    });

    const io = createSocketServer(httpServer);

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
