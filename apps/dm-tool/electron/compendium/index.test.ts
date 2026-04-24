import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumDocument } from './types';
import type { CompendiumHttpClient } from './client';

// The real db cache lives behind better-sqlite3, which electron-rebuild
// binds to Electron's Node ABI. Vitest runs in plain Node, so instead of
// spinning up a real SQLite we mock @foundry-toolkit/db/pf2e with an
// in-memory Map. That also keeps the test focused on the factory's
// orchestration — cache-hit / TTL / stale-fallback paths — rather than
// on SQL behavior, which we trust the DB layer to enforce.

interface CachedRow {
  body: unknown;
  fetchedAt: number;
}

const cacheStore = new Map<string, CachedRow>();

vi.mock('@foundry-toolkit/db/pf2e', () => {
  return {
    getCachedDocument: vi.fn((uuid: string, maxAgeMs: number) => {
      const row = cacheStore.get(uuid);
      if (!row) return null;
      if (Date.now() - row.fetchedAt > maxAgeMs) return null;
      return { uuid, fetchedAt: row.fetchedAt, body: row.body };
    }),
    getCachedDocumentAllowStale: vi.fn((uuid: string) => {
      const row = cacheStore.get(uuid);
      return row ? { uuid, fetchedAt: row.fetchedAt, body: row.body } : null;
    }),
    putCachedDocument: vi.fn((uuid: string, body: unknown) => {
      cacheStore.set(uuid, { body, fetchedAt: Date.now() });
    }),
    invalidateCachedDocument: vi.fn((uuid: string) => {
      cacheStore.delete(uuid);
    }),
    invalidateAllCachedDocuments: vi.fn(() => {
      cacheStore.clear();
    }),
  };
});

// Imports must come after vi.mock so the mock is applied.
const { createCompendiumApi, CompendiumRequestError } = await import('./index');

function doc(uuid: string, name = 'Test Doc'): CompendiumDocument {
  return { id: uuid, uuid, name, type: 'spell', img: '', system: {} };
}

function fakeClient(overrides: Partial<CompendiumHttpClient> = {}): CompendiumHttpClient {
  const base: CompendiumHttpClient = {
    searchCompendium: vi.fn().mockResolvedValue({ matches: [] }),
    getCompendiumDocument: vi.fn().mockResolvedValue({ document: doc('default-uuid') }),
    listCompendiumPacks: vi.fn().mockResolvedValue({ packs: [] }),
    listCompendiumSources: vi.fn().mockResolvedValue({ sources: [] }),
  };
  return { ...base, ...overrides };
}

describe('createCompendiumApi', () => {
  beforeEach(() => {
    cacheStore.clear();
  });

  it('hits the HTTP client on first document read, then serves from cache on the second', async () => {
    const get = vi.fn().mockResolvedValue({ document: doc('u1', 'Acid Arrow') });
    const api = createCompendiumApi({
      baseUrl: 'http://ignored',
      httpClient: fakeClient({ getCompendiumDocument: get }),
    });

    const first = await api.getCompendiumDocument('u1');
    const second = await api.getCompendiumDocument('u1');

    expect(first.document.name).toBe('Acid Arrow');
    expect(first.stale).toBe(false);
    expect(second.document.name).toBe('Acid Arrow');
    expect(second.stale).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the cached row is older than the TTL', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ document: doc('u1', 'v1') })
      .mockResolvedValueOnce({ document: doc('u1', 'v2') });
    const api = createCompendiumApi({
      baseUrl: 'http://ignored',
      documentTtlMs: 1,
      httpClient: fakeClient({ getCompendiumDocument: get }),
    });

    const first = await api.getCompendiumDocument('u1');
    await new Promise((r) => setTimeout(r, 10));
    const second = await api.getCompendiumDocument('u1');

    expect(first.document.name).toBe('v1');
    expect(second.document.name).toBe('v2');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('serves a stale cached row when the HTTP fetch fails after cache expires', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ document: doc('u2', 'cached version') })
      .mockRejectedValueOnce(new CompendiumRequestError(503, 'upstream down'));
    const api = createCompendiumApi({
      baseUrl: 'http://ignored',
      documentTtlMs: 1,
      httpClient: fakeClient({ getCompendiumDocument: get }),
    });

    await api.getCompendiumDocument('u2');
    await new Promise((r) => setTimeout(r, 10));
    const result = await api.getCompendiumDocument('u2');

    expect(result.document.name).toBe('cached version');
    expect(result.stale).toBe(true);
  });

  it('rethrows when HTTP fails and nothing is cached', async () => {
    const get = vi.fn().mockRejectedValue(new CompendiumRequestError(502, 'boom'));
    const api = createCompendiumApi({
      baseUrl: 'http://ignored',
      httpClient: fakeClient({ getCompendiumDocument: get }),
    });

    await expect(api.getCompendiumDocument('never-seen')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
    });
  });

  it('invalidateDocument drops a cached row so the next read goes back to HTTP', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ document: doc('u3', 'first') })
      .mockResolvedValueOnce({ document: doc('u3', 'second') });
    const api = createCompendiumApi({
      baseUrl: 'http://ignored',
      httpClient: fakeClient({ getCompendiumDocument: get }),
    });

    await api.getCompendiumDocument('u3');
    api.invalidateDocument('u3');
    const after = await api.getCompendiumDocument('u3');

    expect(after.document.name).toBe('second');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not cache search results (every search round-trips)', async () => {
    const search = vi.fn().mockResolvedValue({ matches: [] });
    const api = createCompendiumApi({
      baseUrl: 'http://ignored',
      httpClient: fakeClient({ searchCompendium: search }),
    });

    await api.searchCompendium({ q: 'wand' });
    await api.searchCompendium({ q: 'wand' });
    expect(search).toHaveBeenCalledTimes(2);
  });
});
