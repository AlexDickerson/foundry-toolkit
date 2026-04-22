// HTTP client for foundry-mcp's /api/compendium/* surface. Pure fetch —
// no caching, no fallbacks. The factory in ./index.ts composes this with
// the SQLite cache layer from @foundry-toolkit/db/pf2e.
//
// Shapes mirror apps/character-creator/src/api/client.ts; only the
// compendium subset dm-tool actually calls is ported.

import type {
  ApiError,
  CompendiumDocument,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
} from './types.js';

export class CompendiumRequestError extends Error {
  readonly status: number;
  readonly suggestion: string | undefined;

  constructor(status: number, error: string, suggestion?: string) {
    super(error);
    this.name = 'CompendiumRequestError';
    this.status = status;
    this.suggestion = suggestion;
  }
}

/** Strip a trailing slash if present. The mcp config path normaliser
 *  already does this on save, but callers may pass a raw value. */
function normaliseBase(url: string): string {
  return url.replace(/\/+$/, '');
}

async function requestJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let body: ApiError = { error: `HTTP ${res.status.toString()}` };
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // Response wasn't JSON — fall through with the status-only error.
    }
    throw new CompendiumRequestError(res.status, body.error, body.suggestion);
  }
  return (await res.json()) as T;
}

export function buildSearchQuery(opts: CompendiumSearchOptions): string {
  const params = new URLSearchParams();
  if (opts.q !== undefined && opts.q.length > 0) params.set('q', opts.q);
  if (opts.packIds !== undefined && opts.packIds.length > 0) params.set('packId', opts.packIds.join(','));
  if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
  if (opts.traits !== undefined && opts.traits.length > 0) params.set('traits', opts.traits.join(','));
  if (opts.anyTraits !== undefined && opts.anyTraits.length > 0) params.set('anyTraits', opts.anyTraits.join(','));
  if (opts.sources !== undefined && opts.sources.length > 0) params.set('sources', opts.sources.join(','));
  if (opts.ancestrySlug !== undefined && opts.ancestrySlug.length > 0) params.set('ancestrySlug', opts.ancestrySlug);
  if (opts.maxLevel !== undefined) params.set('maxLevel', opts.maxLevel.toString());
  if (opts.limit !== undefined) params.set('limit', opts.limit.toString());
  return params.toString();
}

export interface CompendiumHttpClient {
  searchCompendium(opts: CompendiumSearchOptions): Promise<{ matches: CompendiumMatch[] }>;
  getCompendiumDocument(uuid: string): Promise<{ document: CompendiumDocument }>;
  listCompendiumPacks(opts?: { documentType?: string }): Promise<{ packs: CompendiumPack[] }>;
  listCompendiumSources(
    opts?: { documentType?: string; packIds?: string[]; q?: string; traits?: string[]; maxLevel?: number },
  ): Promise<{ sources: CompendiumSource[] }>;
}

/** Build a typed HTTP client rooted at a foundry-mcp base URL. Example
 *  baseUrls: `http://localhost:8765`, `https://mcp.example.fly.dev`. */
export function createCompendiumHttpClient(baseUrl: string): CompendiumHttpClient {
  const base = normaliseBase(baseUrl);

  return {
    searchCompendium(opts) {
      return requestJson<{ matches: CompendiumMatch[] }>(`${base}/api/compendium/search?${buildSearchQuery(opts)}`);
    },

    getCompendiumDocument(uuid) {
      return requestJson<{ document: CompendiumDocument }>(
        `${base}/api/compendium/document?uuid=${encodeURIComponent(uuid)}`,
      );
    },

    listCompendiumPacks(opts = {}) {
      const params = new URLSearchParams();
      if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
      const qs = params.toString();
      return requestJson<{ packs: CompendiumPack[] }>(`${base}/api/compendium/packs${qs ? `?${qs}` : ''}`);
    },

    listCompendiumSources(opts = {}) {
      const params = new URLSearchParams();
      if (opts.documentType !== undefined) params.set('documentType', opts.documentType);
      if (opts.packIds !== undefined && opts.packIds.length > 0) params.set('packId', opts.packIds.join(','));
      if (opts.q !== undefined && opts.q.length > 0) params.set('q', opts.q);
      if (opts.traits !== undefined && opts.traits.length > 0) params.set('traits', opts.traits.join(','));
      if (opts.maxLevel !== undefined) params.set('maxLevel', opts.maxLevel.toString());
      const qs = params.toString();
      return requestJson<{ sources: CompendiumSource[] }>(`${base}/api/compendium/sources${qs ? `?${qs}` : ''}`);
    },
  };
}
