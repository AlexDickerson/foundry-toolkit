import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSearchQuery, CompendiumRequestError, createCompendiumHttpClient } from './client';

// ---------------------------------------------------------------------------
// buildSearchQuery
// ---------------------------------------------------------------------------

describe('buildSearchQuery', () => {
  it('encodes every filter field the server understands', () => {
    const qs = buildSearchQuery({
      q: 'fireball',
      packIds: ['pf2e.spells-srd', 'pf2e.equipment-srd'],
      documentType: 'Item',
      traits: ['arcane', 'fire'],
      anyTraits: ['evocation'],
      sources: ['Player Core'],
      ancestrySlug: 'human',
      maxLevel: 5,
      limit: 20,
    });
    const params = new URLSearchParams(qs);
    expect(params.get('q')).toBe('fireball');
    expect(params.get('packId')).toBe('pf2e.spells-srd,pf2e.equipment-srd');
    expect(params.get('documentType')).toBe('Item');
    expect(params.get('traits')).toBe('arcane,fire');
    expect(params.get('anyTraits')).toBe('evocation');
    expect(params.get('sources')).toBe('Player Core');
    expect(params.get('ancestrySlug')).toBe('human');
    expect(params.get('maxLevel')).toBe('5');
    expect(params.get('limit')).toBe('20');
  });

  it('omits empty arrays and empty strings so the server guardrail on "every filter empty" still triggers', () => {
    const qs = buildSearchQuery({ q: '', packIds: [], traits: [] });
    expect(qs).toBe('');
  });

  it('omits undefined fields', () => {
    const qs = buildSearchQuery({ q: 'orc' });
    const params = new URLSearchParams(qs);
    expect(params.get('q')).toBe('orc');
    expect(params.get('packId')).toBeNull();
    expect(params.get('maxLevel')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createCompendiumHttpClient — fetch wiring
// ---------------------------------------------------------------------------

describe('createCompendiumHttpClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('strips a trailing slash from the base URL', async () => {
    const client = createCompendiumHttpClient('http://localhost:8765/');
    fetchMock.mockResolvedValueOnce(jsonResponse({ matches: [] }));
    await client.searchCompendium({ q: 'wand' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith('http://localhost:8765/api/compendium/search?')).toBe(true);
  });

  it('builds the search URL with the right path and query', async () => {
    const client = createCompendiumHttpClient('http://localhost:8765');
    fetchMock.mockResolvedValueOnce(jsonResponse({ matches: [] }));
    await client.searchCompendium({ q: 'wand of fireballs', maxLevel: 10 });
    const url = fetchMock.mock.calls[0][0] as string;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/compendium/search');
    expect(parsed.searchParams.get('q')).toBe('wand of fireballs');
    expect(parsed.searchParams.get('maxLevel')).toBe('10');
  });

  it('URL-encodes uuid segments with dots and pipes', async () => {
    const client = createCompendiumHttpClient('http://localhost:8765');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ document: { id: 'x', uuid: 'x', name: 'x', type: 'spell', img: '', system: {} } }),
    );
    const uuid = 'Compendium.pf2e.spells-srd.Item.abc|def';
    await client.getCompendiumDocument(uuid);
    const url = fetchMock.mock.calls[0][0] as string;
    // encodeURIComponent escapes the pipe; dots pass through untouched
    expect(url).toContain(`uuid=${encodeURIComponent(uuid)}`);
    expect(url).toContain('%7Cdef');
  });

  it('parses structured error responses into CompendiumRequestError', async () => {
    const client = createCompendiumHttpClient('http://localhost:8765');
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not found', suggestion: 'Check the uuid' }, 404));
    await expect(client.getCompendiumDocument('bad-uuid')).rejects.toMatchObject({
      name: 'CompendiumRequestError',
      status: 404,
      message: 'Not found',
      suggestion: 'Check the uuid',
    });
  });

  it('falls back to status-only error when the body is not JSON', async () => {
    const client = createCompendiumHttpClient('http://localhost:8765');
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 502 }));
    await expect(client.searchCompendium({ q: 'any' })).rejects.toMatchObject({
      name: 'CompendiumRequestError',
      status: 502,
      message: 'HTTP 502',
    });
  });

  it('omits the querystring on /packs when no documentType is passed', async () => {
    const client = createCompendiumHttpClient('http://localhost:8765');
    fetchMock.mockResolvedValueOnce(jsonResponse({ packs: [] }));
    await client.listCompendiumPacks();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('http://localhost:8765/api/compendium/packs');
  });
});

// Sanity: the class comparison is useful in consumers' `instanceof` checks.
describe('CompendiumRequestError', () => {
  it('is recognised by instanceof', () => {
    const err = new CompendiumRequestError(500, 'boom', 'try again');
    expect(err).toBeInstanceOf(CompendiumRequestError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
    expect(err.suggestion).toBe('try again');
  });
});
