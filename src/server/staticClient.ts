import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two levels up from src/server/ (dev, via tsx) or dist/server/ (prod, after tsc build) is the
// project root either way, so this single relative path works unbuilt and built.
const CLIENT_DIST = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../dist-client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** True once `npm run build:client` has produced a dist-client/ to serve. */
export function hasBuiltClient(): boolean {
  return existsSync(join(CLIENT_DIST, 'index.html'));
}

/**
 * Serves the built Vite client so the whole app — API, sockets, and UI — can run as one free
 * web service (no separate static host, no cross-origin config). Returns true if it handled the
 * request (caller should not respond further); false to let the caller fall through to 404.
 */
export function serveClientAsset(req: IncomingMessage, res: ServerResponse): boolean {
  if (!hasBuiltClient()) return false;

  const requestedPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  let filePath = resolvePath(join(CLIENT_DIST, requestedPath));

  // Path-traversal guard: never serve anything outside dist-client.
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403);
    res.end();
    return true;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) {
    // Single-page app fallback so a refresh on any client-side route still loads the app.
    filePath = join(CLIENT_DIST, 'index.html');
  }

  const contentType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': contentType });
  createReadStream(filePath).pipe(res);
  return true;
}
