import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssetCache } from '../src/http/asset-cache.js';

function makeEntry(size: number, overrides: Partial<{ status: number; expiresAt: number | null }> = {}) {
  return {
    contentType: 'image/webp',
    body: Buffer.alloc(size, 0x42),
    status: overrides.status ?? 200,
    expiresAt: overrides.expiresAt ?? null,
  };
}

describe('AssetCache', () => {
  it('returns null on miss and counts it', () => {
    const cache = new AssetCache(1024);
    assert.equal(cache.get('/systems/x.webp'), null);
    const stats = cache.stats();
    assert.equal(stats.hits, 0);
    assert.equal(stats.misses, 1);
  });

  it('stores and retrieves entries; counts hits', () => {
    const cache = new AssetCache(1024);
    cache.set('/icons/a.webp', makeEntry(100));
    const hit = cache.get('/icons/a.webp');
    assert.ok(hit);
    assert.equal(hit.body.length, 100);
    assert.equal(cache.stats().hits, 1);
    assert.equal(cache.stats().entries, 1);
    assert.equal(cache.stats().bytes, 100);
  });

  it('evicts least-recently-used entries once over cap', () => {
    const cache = new AssetCache(300);
    cache.set('/a', makeEntry(100));
    cache.set('/b', makeEntry(100));
    cache.set('/c', makeEntry(100));
    // All three fit (300 bytes exactly).
    assert.equal(cache.stats().entries, 3);

    // Touch /a so it's now MRU; /b becomes LRU.
    cache.get('/a');

    // Adding /d (100 bytes) puts us at 400; must evict /b (LRU) to fit.
    cache.set('/d', makeEntry(100));
    assert.equal(cache.get('/b'), null);
    assert.ok(cache.get('/a'));
    assert.ok(cache.get('/c'));
    assert.ok(cache.get('/d'));
    assert.ok(cache.stats().evictions >= 1);
  });

  it('skips entries larger than the whole cap', () => {
    const cache = new AssetCache(100);
    cache.set('/big', makeEntry(500));
    assert.equal(cache.stats().entries, 0);
    assert.equal(cache.stats().bytes, 0);
    assert.equal(cache.get('/big'), null);
  });

  it('expires negative-cached entries after TTL', () => {
    const cache = new AssetCache(1024);
    cache.set('/missing', makeEntry(0, { status: 404, expiresAt: Date.now() - 1 }));
    // Already expired — get() should drop it and return null.
    assert.equal(cache.get('/missing'), null);
    assert.equal(cache.stats().entries, 0);
  });

  it('returns a non-expired negative entry as a 404 envelope', () => {
    const cache = new AssetCache(1024);
    cache.set('/missing', makeEntry(0, { status: 404, expiresAt: Date.now() + 60_000 }));
    const hit = cache.get('/missing');
    assert.ok(hit);
    assert.equal(hit.status, 404);
  });

  it('overwriting an existing key replaces bytes in the accounting', () => {
    const cache = new AssetCache(1024);
    cache.set('/x', makeEntry(100));
    cache.set('/x', makeEntry(200));
    assert.equal(cache.stats().entries, 1);
    assert.equal(cache.stats().bytes, 200);
  });

  it('reports a hit rate', () => {
    const cache = new AssetCache(1024);
    cache.set('/x', makeEntry(50));
    cache.get('/x'); // hit
    cache.get('/y'); // miss
    const stats = cache.stats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.hitRate, 0.5);
  });
});
