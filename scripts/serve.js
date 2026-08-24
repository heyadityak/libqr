/**
 * Minimal static file server for the browser tests and the examples.
 *
 * Dependency-free on purpose: ADR-0001 keeps runtime dependencies at zero, and
 * adding a dev dependency to serve a directory over HTTP is not worth it. The
 * browser tests need a real origin because `file://` cannot load ES modules.
 *
 * Usage: node scripts/serve.js [port]
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2] ?? 8974);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer((request, response) => {
  // Strip the query string, then normalise away any `..` before joining, so a
  // request cannot escape the repository root.
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let target = join(ROOT, safe);

  try {
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end(`Not found: ${safe}`);
    return;
  }

  if (!target.startsWith(ROOT)) {
    response.writeHead(403, { 'content-type': 'text/plain' });
    response.end('Forbidden');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(response);
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
});
