// HTTP client for foundry-mcp's /api/compendium/* surface. Pure fetch —
// no caching, no fallbacks. The factory in ./index.ts composes this with
// the SQLite cache layer from @foundry-toolkit/db/pf2e.
//
// The transport primitives (`ApiRequestError`, `requestJson`,
// `buildCompendiumQuery`) live in `@foundry-toolkit/shared/http` so
// player-portal can share them. We re-export under the historical local
// names (`CompendiumRequestError`, `buildSearchQuery`) so existing
// callsites + `instanceof` checks keep working.

import { buildCompendiumQuery, requestJson } from '@foundry-toolkit/shared/http';

import type {
  CompendiumDocument,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
} from './types.js';

export {
  ApiRequestError as CompendiumRequestError,
  buildCompendiumQuery as buildSearchQuery,
} from '@foundry-toolkit/shared/http';

/** Strip a trailing slash if present. The mcp config path normaliser
 *  already does this on save, but callers may pass a raw value. */
function normaliseBase(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface CompendiumHttpClient {
  searchCompendium(opts: CompendiumSearchOptions): Promise<{ matches: CompendiumMatch[] }>;
  getCompendiumDocument(uuid: string): Promise<{ document: CompendiumDocument }>;
  listCompendiumPacks(opts?: { documentType?: string }): Promise<{ packs: CompendiumPack[] }>;
  listCompendiumSources(opts?: {
    documentType?: string;
    packIds?: string[];
    q?: string;
    traits?: string[];
    maxLevel?: number;
  }): Promise<{ sources: CompendiumSource[] }>;
}

/** Build a typed HTTP client rooted at a foundry-mcp base URL. Example
 *  baseUrls: `http://localhost:8765`, `https://mcp.example.fly.dev`. */
export function createCompendiumHttpClient(baseUrl: string): CompendiumHttpClient {
  const base = normaliseBase(baseUrl);

  return {
    searchCompendium(opts) {
      return requestJson<{ matches: CompendiumMatch[] }>(`${base}/api/compendium/search?${buildCompendiumQuery(opts)}`);
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
