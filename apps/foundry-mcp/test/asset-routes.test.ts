import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { AssetCache } from '../src/http/asset-cache.js';
import { registerAssetRoutes } from '../src/http/routes/assets.js';

// Build a tiny Fastify app with just the asset routes wired in, using
// injected fake deps so we never touch the real WS bridge.
function makeApp(opts: {
  connected?: boolean;
  respond?: (path: string) => Promise<unknown>;
  cache?: AssetCache;
  negativeCacheTtlMs?: number;
}): { app: FastifyInstance; cache: AssetCache; callCount: () => number; lastPath: () => string | null } {
  let calls = 0;
  let last: string | null = null;

  const app = Fastify({ logger: false });
  const cache = opts.cache ?? new AssetCache(1_000_000);
  registerAssetRoutes(app, {
    cache,
    isFoundryConnected: () => opts.connected ?? true,
    sendCommand: async (_type, params) => {
      calls++;
      const p = (params?.['path'] as string | undefined) ?? '';
      last = p;
      if (opts.respond) return opts.respond(p);
      return { ok: true, contentType: 'image/webp', bytes: Buffer.from('hello').toString('base64') };
    },
  });

  return { app, cache, callCount: () => calls, lastPath: () => last };
}

describe('asset routes — prefix allow/deny', () => {
  it('matches /systems/*', async () => {
    const { app } = makeApp({});
    const res = await app.inject({ method: 'GET', url: '/systems/pf2e/icons/foo.webp' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/webp');
    assert.equal(res.rawPayload.toString(), 'hello');
  });

  it('matches /icons/*', async () => {
    const { app } = makeApp({});
    const res = await app.inject({ method: 'GET', url: '/icons/svg/mystery-man.svg' });
    assert.equal(res.statusCode, 200);
  });

  it('matches /modules/*', async () => {
    const { app } = makeApp({});
    const res = await app.inject({ method: 'GET', url: '/modules/foundry-api-bridge/icon.png' });
    assert.equal(res.statusCode, 200);
  });

  it('matches /worlds/*', async () => {
    const { app } = makeApp({});
    const res = await app.inject({ method: 'GET', url: '/worlds/test/assets/banner.png' });
    assert.equal(res.statusCode, 200);
  });

  it('matches /ui/*', async () => {
    const { app } = makeApp({});
    const res = await app.inject({ method: 'GET', url: '/ui/controls/arrow.png' });
    assert.equal(res.statusCode, 200);
  });

  it('does not match non-whitelisted prefixes', async () => {
    const { app, callCount } = makeApp({});
    // /etc/* and /foo/* should NOT have an asset route — they fall
    // through to Fastify's default 404 behaviour.
    const res = await app.inject({ method: 'GET', url: '/etc/passwd' });
    assert.notEqual(res.statusCode, 200);
    assert.equal(callCount(), 0, 'bridge should not be called for denied prefixes');
  });
});

describe('asset routes — caching', () => {
  it('serves from cache on second request (single bridge call)', async () => {
    const { app, callCount } = makeApp({});
    const r1 = await app.inject({ method: 'GET', url: '/systems/pf2e/icons/a.webp' });
    const r2 = await app.inject({ method: 'GET', url: '/systems/pf2e/icons/a.webp' });
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    assert.equal(callCount(), 1);
  });

  it('sets immutable cache headers on hits', async () => {
    const { app } = makeApp({});
    const r1 = await app.inject({ method: 'GET', url: '/systems/x/a.webp' });
    assert.match(String(r1.headers['cache-control']), /immutable/);
    const r2 = await app.inject({ method: 'GET', url: '/systems/x/a.webp' });
    assert.match(String(r2.headers['cache-control']), /immutable/);
  });

  it('preserves content-type from the bridge envelope', async () => {
    const { app } = makeApp({
      respond: async () => ({
        ok: true,
        contentType: 'image/svg+xml',
        bytes: Buffer.from('<svg/>').toString('base64'),
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/icons/svg/foo.svg' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/svg+xml');
    assert.equal(res.rawPayload.toString(), '<svg/>');
  });

  it('evicts entries when the cache cap is exceeded', async () => {
    const cache = new AssetCache(200);
    const { app } = makeApp({
      cache,
      respond: async (path) => ({
        ok: true,
        contentType: 'image/webp',
        bytes: Buffer.alloc(100, path.charCodeAt(path.length - 1)).toString('base64'),
      }),
    });
    await app.inject({ method: 'GET', url: '/systems/a/x.webp' });
    await app.inject({ method: 'GET', url: '/systems/a/y.webp' });
    await app.inject({ method: 'GET', url: '/systems/a/z.webp' });
    const stats = cache.stats();
    assert.ok(stats.bytes <= 200, `bytes should be <= 200, got ${stats.bytes}`);
    assert.ok(stats.evictions >= 1);
  });
});

describe('asset routes — bridge state / errors', () => {
  it('returns 503 plain-text when bridge is disconnected', async () => {
    const { app, callCount } = makeApp({ connected: false });
    const res = await app.inject({ method: 'GET', url: '/systems/pf2e/x.webp' });
    assert.equal(res.statusCode, 503);
    assert.match(String(res.headers['content-type']), /text\/plain/);
    assert.equal(res.rawPayload.toString(), 'Foundry module not connected');
    assert.equal(callCount(), 0);
  });

  it('maps bridge-reported 404 to 404 and negative-caches briefly', async () => {
    const cache = new AssetCache(1_000_000);
    const { app, callCount } = makeApp({
      cache,
      negativeCacheTtlMs: 60_000,
      respond: async () => ({ ok: false, status: 404, error: 'File not found' }),
    });
    const r1 = await app.inject({ method: 'GET', url: '/systems/pf2e/dead.webp' });
    assert.equal(r1.statusCode, 404);
    // Second hit should come from the negative cache — no extra bridge call.
    const r2 = await app.inject({ method: 'GET', url: '/systems/pf2e/dead.webp' });
    assert.equal(r2.statusCode, 404);
    assert.equal(callCount(), 1, 'second request should be served from negative cache');
  });

  it('maps bridge-reported 502 to 502 without caching', async () => {
    const cache = new AssetCache(1_000_000);
    const { app, callCount } = makeApp({
      cache,
      respond: async () => ({ ok: false, status: 502, error: 'Fetch failed' }),
    });
    await app.inject({ method: 'GET', url: '/systems/pf2e/err.webp' });
    await app.inject({ method: 'GET', url: '/systems/pf2e/err.webp' });
    // Both hits should go through — 5xx isn't cached.
    assert.equal(callCount(), 2);
  });

  it('maps a thrown "timed out" command to 504', async () => {
    const { app } = makeApp({
      respond: async () => {
        throw new Error("Command 'fetch-asset' timed out after 30000ms");
      },
    });
    const res = await app.inject({ method: 'GET', url: '/systems/pf2e/slow.webp' });
    assert.equal(res.statusCode, 504);
  });

  it('maps a thrown "not connected" command to 503', async () => {
    const { app } = makeApp({
      respond: async () => {
        throw new Error('Foundry module not connected');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/systems/pf2e/x.webp' });
    assert.equal(res.statusCode, 503);
  });

  it('treats a malformed bridge envelope as 502', async () => {
    const { app } = makeApp({
      respond: async () => 'not an envelope',
    });
    const res = await app.inject({ method: 'GET', url: '/systems/pf2e/weird.webp' });
    assert.equal(res.statusCode, 502);
  });
});

// Regression: character-sheet weapon/feat/spell icons failed to load after
// the character-creator SPA was merged into player-portal. Foundry stores
// asset paths without a leading slash (e.g. `icons/weapons/polearms/...`),
// which browsers resolve relative to the current document URL. When the SPA
// moved from foundry-mcp's root to player-portal's /characters/:actorId
// route, relative paths resolved against /characters/ instead of /, causing
// browsers to request /characters/icons/... — not handled by any proxy.
// Fix: <base href="/"> in player-portal's index.html makes all relative
// asset URLs root-absolute. These tests confirm foundry-mcp's /icons/* route
// handles the specific path shape the character sheet renders.
describe('asset routes — regression: character-sheet icon paths', () => {
  it('serves icons/weapons/polearms/spear-hooked-broad.webp with 200 and correct content-type', async () => {
    const { app } = makeApp({
      respond: async () => ({
        ok: true,
        contentType: 'image/webp',
        bytes: Buffer.from('fake-webp-bytes').toString('base64'),
      }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/icons/weapons/polearms/spear-hooked-broad.webp',
    });
    assert.equal(res.statusCode, 200, 'weapon icon should return 200');
    assert.equal(res.headers['content-type'], 'image/webp', 'weapon icon should return image/webp');
    assert.ok(res.rawPayload.length > 0, 'weapon icon body should be non-empty');
  });

  it('returns 404 when Foundry reports the icon path does not exist', async () => {
    const { app } = makeApp({
      respond: async () => ({ ok: false, status: 404, error: 'File not found' }),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/icons/weapons/polearms/spear-hooked-broad.webp',
    });
    assert.equal(res.statusCode, 404, 'missing icon should return 404');
    assert.match(String(res.headers['content-type']), /text\/plain/, '404 body should be plain text');
  });

  it('serves icons/svg/mystery-man.svg with correct SVG content-type', async () => {
    const { app } = makeApp({
      respond: async () => ({
        ok: true,
        contentType: 'image/svg+xml',
        bytes: Buffer.from('<svg/>').toString('base64'),
      }),
    });
    const res = await app.inject({ method: 'GET', url: '/icons/svg/mystery-man.svg' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/svg+xml');
  });
});

describe('debug endpoint', () => {
  it('returns cache counters as JSON', async () => {
    const { app, cache } = makeApp({});
    // Prime the cache.
    await app.inject({ method: 'GET', url: '/systems/pf2e/a.webp' });
    await app.inject({ method: 'GET', url: '/systems/pf2e/a.webp' });
    const res = await app.inject({ method: 'GET', url: '/api/_debug/asset-cache' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as {
      entries: number;
      bytes: number;
      capBytes: number;
      hits: number;
      misses: number;
      hitRate: number;
    };
    assert.equal(body.entries, 1);
    assert.ok(body.hits >= 1);
    assert.equal(body.capBytes, cache.stats().capBytes);
    assert.ok(body.hitRate > 0 && body.hitRate <= 1);
  });
});
