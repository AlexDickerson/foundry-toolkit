// Player portal server. One Fastify process serves the built SPA and four
// namespaces of routes.
//
// Live-sync API — three datasets (inventory, aurus, globe), each with:
//   GET   /api/live/<name>           — read current snapshot (in-memory store)
//   POST  /api/live/<name>           — overwrite snapshot (DM only, bearer auth)
//   GET   /api/live/<name>/stream    — SSE proxy → foundry-mcp stream (public)
// The GET/POST routes still serve the in-memory store (written by dm-tool's
// dual-write); the /stream routes now pipe from foundry-mcp's SSE instead of
// the old @fastify/websocket handlers. In-memory store + POST routes retire
// in the next PR once foundry-mcp is the sole writer.
//
// MCP proxy — /api/mcp/* is transparently proxied to foundry-mcp (default
// http://localhost:8765). The Authorization header is passed through
// unchanged so the SPA's session + any foundry-mcp auth posture applies
// end to end.
//
// Foundry assets — /icons, /systems, /modules, /worlds are proxied to
// foundry-mcp (MCP_URL) so asset fetches go through the MCP server's
// WebSocket bridge to Foundry and benefit from its in-process asset cache.
// Proxying to FOUNDRY_URL directly would break in deployments where the
// Foundry VTT HTTP server is not reachable from player-portal's host —
// only foundry-mcp has a persistent outbound connection to Foundry.
// /assets is intentionally NOT proxied because Vite's built SPA chunks
// live at /assets/*.
//
// Map proxy — /map/* → https://map.pathfinderwiki.com/ so PMTiles tile
// requests are same-origin.
//
// Live-sync auth: single shared bearer secret on writes. Reads + SSE streams
// are unauthed since players need them and nothing private lives in these
// feeds (DM notes stay in dm-tool's SQLite / Obsidian vault).

import './load-env.js';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
import { createStores } from './store.js';
import type { AurusSnapshot, GlobeSnapshot, InventorySnapshot } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const SHARED_SECRET = process.env.SHARED_SECRET;
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:8765';
// In prod the compiled server sits at server-dist/index.js and the SPA
// build is at dist/. In dev Vite serves static from memory on :5173 and
// proxies /api, /map, and the Foundry asset prefixes here, so dist/ may
// not exist — we skip static serving in that case.
const STATIC_DIR = process.env.STATIC_DIR ?? join(__dirname, '..', 'dist');

// Foundry asset prefixes — all proxied to foundry-mcp so the WS bridge
// serves them. `/assets` is deliberately excluded because Vite's built SPA
// uses it for bundled chunks — proxying it would break client JS loading.
const FOUNDRY_ASSET_PREFIXES = ['/icons', '/systems', '/modules', '/worlds'];

if (!SHARED_SECRET) {
  console.error('SHARED_SECRET env var is required');
  process.exit(1);
}

const stores = createStores();

/** Proxy a long-lived SSE GET from foundry-mcp through to the client.
 *  Using raw http/https instead of @fastify/http-proxy because the proxy
 *  plugin's request timeout would close the stream prematurely. */
function makeSseProxy(mcpUrl: string, upstreamPath: string) {
  return (req: FastifyRequest, reply: FastifyReply): void => {
    const target = new URL(`${mcpUrl}${upstreamPath}`);
    const transport = target.protocol === 'https:' ? https : http;
    const proxyReq = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname,
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      },
      (proxyRes) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        proxyRes.pipe(reply.raw);
      },
    );
    req.raw.on('close', () => proxyReq.destroy());
    proxyReq.on('error', () => {
      if (!reply.raw.headersSent) reply.raw.end();
    });
    proxyReq.end();
  };
}

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  // CORS — in prod the SPA and API share an origin so this is a no-op.
  // Only matters in dev when Vite on :5173 hits the server on :3000.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') reply.code(204).send();
  });

  function requireAuth(req: { headers: { authorization?: string } }): boolean {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return false;
    return header.slice(7) === SHARED_SECRET;
  }

  app.get('/health', async () => ({ ok: true }));

  // Reverse-proxy /map/ to map.pathfinderwiki.com — tiles appear to come
  // from our origin so the browser's CORS check passes.
  await app.register(fastifyHttpProxy, {
    upstream: 'https://map.pathfinderwiki.com',
    prefix: '/map',
    rewritePrefix: '/',
    http2: false,
  });

  // Proxy /api/mcp/* → foundry-mcp, passing Authorization through unchanged.
  await app.register(fastifyHttpProxy, {
    upstream: MCP_URL,
    prefix: '/api/mcp',
    rewritePrefix: '/api',
    http2: false,
  });

  // Proxy Foundry asset prefixes → foundry-mcp. One @fastify/http-proxy
  // registration per prefix because the plugin only accepts a single
  // `prefix` string. rewritePrefix matches prefix so paths pass through
  // unchanged (e.g. /icons/foo.webp → upstream /icons/foo.webp).
  // foundry-mcp handles these at the root level via its own asset routes
  // (which use the WS bridge to fetch from Foundry and cache the result).
  for (const prefix of FOUNDRY_ASSET_PREFIXES) {
    await app.register(fastifyHttpProxy, {
      upstream: MCP_URL,
      prefix,
      rewritePrefix: prefix,
      http2: false,
    });
  }

  // --- Inventory ---------------------------------------------------------

  app.get('/api/live/inventory', async () => stores.inventory.get());

  app.post<{ Body: InventorySnapshot }>('/api/live/inventory', async (req, reply) => {
    if (!requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body;
    if (!body || !Array.isArray(body.items)) {
      return reply.code(400).send({ error: 'invalid body' });
    }
    const snapshot: InventorySnapshot = {
      items: body.items,
      updatedAt: new Date().toISOString(),
    };
    stores.inventory.set(snapshot);
    return { ok: true, updatedAt: snapshot.updatedAt };
  });

  app.get('/api/live/inventory/stream', makeSseProxy(MCP_URL, '/api/live/inventory/stream'));

  // --- Aurus leaderboard --------------------------------------------------

  app.get('/api/live/aurus', async () => stores.aurus.get());

  app.post<{ Body: AurusSnapshot }>('/api/live/aurus', async (req, reply) => {
    if (!requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body;
    if (!body || !Array.isArray(body.teams)) {
      return reply.code(400).send({ error: 'invalid body' });
    }
    const snapshot: AurusSnapshot = {
      teams: body.teams,
      updatedAt: new Date().toISOString(),
    };
    stores.aurus.set(snapshot);
    return { ok: true, updatedAt: snapshot.updatedAt };
  });

  app.get('/api/live/aurus/stream', makeSseProxy(MCP_URL, '/api/live/aurus/stream'));

  // --- Globe pins --------------------------------------------------------

  app.get('/api/live/globe', async () => stores.globe.get());

  app.post<{ Body: GlobeSnapshot }>('/api/live/globe', async (req, reply) => {
    if (!requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body;
    if (!body || !Array.isArray(body.pins)) {
      return reply.code(400).send({ error: 'invalid body' });
    }
    const snapshot: GlobeSnapshot = {
      pins: body.pins,
      updatedAt: new Date().toISOString(),
    };
    stores.globe.set(snapshot);
    return { ok: true, updatedAt: snapshot.updatedAt };
  });

  app.get('/api/live/globe/stream', makeSseProxy(MCP_URL, '/api/live/globe/stream'));

  // --- Static SPA --------------------------------------------------------
  // Only register if dist/ exists — in dev, Vite serves static itself and
  // forwards API/map/asset traffic here via its dev-server proxy.
  if (existsSync(STATIC_DIR)) {
    await app.register(fastifyStatic, { root: STATIC_DIR });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/map/')) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      // Asset prefix requests that land here were not caught by a proxy
      // route — return a plain 404 rather than serving index.html, which
      // would confuse the browser into parsing HTML as an image.
      const isAssetPrefix = FOUNDRY_ASSET_PREFIXES.some((p) => req.url.startsWith(p + '/') || req.url === p);
      if (isAssetPrefix) {
        console.warn(`asset proxy miss: ${req.url} — not caught by any proxy route`);
        reply.code(404).type('text/plain').send('asset not found');
        return;
      }
      // SPA fallback — deep-linked client routes get index.html.
      reply.sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
