// Player portal server. One Fastify process serves the built SPA and routes.
//
// Live-sync streams — /api/live/<name>/stream SSE routes proxy to foundry-mcp.
//   GET /api/live/<name>/stream  — SSE proxy → foundry-mcp (public, read-only)
// GET/POST snapshot routes were retired in this PR; foundry-mcp is now the
// sole live-state store.
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

import './load-env.js';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
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

/** Proxy a long-lived SSE GET from foundry-mcp through to the client.
 *  Using raw http/https instead of @fastify/http-proxy because the proxy
 *  plugin's request timeout would close the stream prematurely. */
function makeSseProxy(mcpUrl: string, upstreamPath: string) {
  return (req: FastifyRequest, reply: FastifyReply): void => {
    // Fastify sees the handler return void and would send its own empty
    // response before the async http.request callback fires, closing the
    // connection before any SSE data can flow. hijack() marks the reply
    // as taken over so Fastify leaves it completely alone.
    reply.hijack();
    const target = new URL(`${mcpUrl}${upstreamPath}`);
    const transport = target.protocol === 'https:' ? https : http;
    const proxyReq = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
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

  app.get('/health', async () => ({ ok: true }));

  // Reverse-proxy /map/ to map.pathfinderwiki.com — tiles appear to come
  // from our origin so the browser's CORS check passes.
  // logLevel: 'warn' suppresses per-request info logs for tile fetches (very noisy).
  await app.register(fastifyHttpProxy, {
    upstream: 'https://map.pathfinderwiki.com',
    prefix: '/map',
    rewritePrefix: '/',
    http2: false,
    logLevel: 'warn',
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
  for (const prefix of FOUNDRY_ASSET_PREFIXES) {
    await app.register(fastifyHttpProxy, {
      upstream: MCP_URL,
      prefix,
      rewritePrefix: prefix,
      http2: false,
    });
  }

  // --- Live-state SSE streams (proxy to foundry-mcp) ----------------------
  // These must use makeSseProxy rather than the general @fastify/http-proxy
  // because the plugin's request timeout closes long-lived SSE connections.

  app.get('/api/live/aurus/stream', makeSseProxy(MCP_URL, '/api/live/aurus/stream'));
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
