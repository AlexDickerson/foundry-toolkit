import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isFoundryConnected, sendCommand } from '../../bridge.js';
import { log } from '../../logger.js';
import { AssetCache, assetCache, NEGATIVE_CACHE_TTL_MS } from '../asset-cache.js';

// Foundry asset path prefixes we proxy through the WS bridge. The SPA
// loads actors whose `img` / `icon` fields are relative paths like
// `systems/pf2e/icons/iconics/portraits/amiri.webp`; the browser resolves
// them against our origin so requests land here. The sibling foundry-
// api-bridge module whitelists the same prefixes.
//
// Deliberately omitted:
// - `/assets/*` — owned by @fastify/static for the Vite SPA bundle.
// - `/api/*`, `/healthz`, `/mcp`, `/foundry` — server-owned.
const ASSET_PREFIXES = ['/icons', '/systems', '/modules', '/worlds', '/ui'] as const;

// Envelope from the bridge (matches foundry-api-bridge `fetch-asset`):
//   success: { ok: true,  contentType: string, bytes: string /* base64 */ }
//   failure: { ok: false, status: number, error: string }
interface FetchAssetEnvelope {
  ok: boolean;
  contentType?: string;
  bytes?: string;
  status?: number;
  error?: string;
}

function isFetchAssetEnvelope(v: unknown): v is FetchAssetEnvelope {
  return typeof v === 'object' && v !== null && 'ok' in v && typeof (v as { ok: unknown }).ok === 'boolean';
}

/** Optional DI hooks for tests — production callers don't pass anything. */
interface AssetRouteDeps {
  cache?: AssetCache;
  sendCommand?: (type: string, params?: Record<string, unknown>) => Promise<unknown>;
  isFoundryConnected?: () => boolean;
  negativeCacheTtlMs?: number;
}

export function registerAssetRoutes(app: FastifyInstance, deps: AssetRouteDeps = {}): void {
  const cache = deps.cache ?? assetCache;
  const send = deps.sendCommand ?? sendCommand;
  const isConnected = deps.isFoundryConnected ?? isFoundryConnected;
  const negTtl = deps.negativeCacheTtlMs ?? NEGATIVE_CACHE_TTL_MS;

  async function handleAssetRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    // `req.url` may include a query string; strip it so cache keys are
    // path-only. We never forward queries to the bridge.
    const path = (req.url ?? '').split('?')[0] ?? '';

    // Serve from cache if we have it (including short-lived negative 404s).
    const cached = cache.get(path);
    if (cached) {
      if (cached.status === 404) {
        reply.code(404).type('text/plain').send('Asset not found');
        return;
      }
      reply
        .code(200)
        .header('Content-Type', cached.contentType)
        .header('Content-Length', cached.body.length)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(cached.body);
      return;
    }

    if (!isConnected()) {
      // Same message text as the /api/* 503. We return plain-text here
      // since the request is for an asset — the browser is likely trying
      // to render this as an <img>, so keep the body minimal.
      reply.code(503).type('text/plain').send('Foundry module not connected');
      return;
    }

    let envelope: FetchAssetEnvelope;
    try {
      const data = await send('fetch-asset', { path });
      if (!isFetchAssetEnvelope(data)) {
        log.warn(`fetch-asset ${path} returned malformed envelope`);
        reply.code(502).type('text/plain').send('Bad asset response from Foundry module');
        return;
      }
      envelope = data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // `not connected` can race (connection drops between the check and
      // the send); map to 503 to match the rest of the surface.
      if (msg.toLowerCase().includes('not connected')) {
        reply.code(503).type('text/plain').send('Foundry module not connected');
        return;
      }
      if (msg.toLowerCase().includes('timed out')) {
        reply.code(504).type('text/plain').send(msg);
        return;
      }
      log.error(`fetch-asset ${path} failed: ${msg}`);
      reply.code(502).type('text/plain').send(msg);
      return;
    }

    if (!envelope.ok) {
      const status = typeof envelope.status === 'number' ? envelope.status : 502;
      const errorMsg = envelope.error ?? `Asset fetch failed (${status})`;

      // Cache 404s briefly so dead paths don't hammer the bridge. 5xx are
      // transient — don't cache those.
      if (status === 404) {
        log.warn(`asset proxy: path not found in Foundry: ${path}`);
        cache.set(path, {
          contentType: 'text/plain',
          body: Buffer.alloc(0),
          status: 404,
          expiresAt: Date.now() + negTtl,
        });
      } else {
        log.warn(`asset proxy: upstream error for ${path}: ${errorMsg} (status ${status.toString()})`);
      }

      reply.code(status).type('text/plain').send(errorMsg);
      return;
    }

    const contentType = envelope.contentType ?? 'application/octet-stream';
    const bytesB64 = envelope.bytes ?? '';
    let body: Buffer;
    try {
      body = Buffer.from(bytesB64, 'base64');
    } catch (err) {
      log.error(`fetch-asset ${path} base64 decode failed: ${err}`);
      reply.code(502).type('text/plain').send('Failed to decode asset body');
      return;
    }

    cache.set(path, {
      contentType,
      body,
      status: 200,
      expiresAt: null,
    });

    reply
      .code(200)
      .header('Content-Type', contentType)
      .header('Content-Length', body.length)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(body);
  }

  // Wildcard routes per prefix. Fastify matches `*` as a greedy
  // parameter named `'*'`; we don't actually consume it here, we
  // just want the full `req.url`.
  for (const prefix of ASSET_PREFIXES) {
    app.get(`${prefix}/*`, handleAssetRequest);
  }

  // Ops visibility — a lightweight counters endpoint. Intentionally open:
  // no secrets, just byte/entry counters and a hit-rate number. Matches
  // the repo's approach of gating dev-only dangerous endpoints (eval) by
  // env flag; this one is harmless.
  app.get('/api/_debug/asset-cache', async () => {
    return cache.stats();
  });
}
