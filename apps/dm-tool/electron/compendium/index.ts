// Factory that composes the raw HTTP client with the SQLite document cache.
// Consumers (IPC handlers, eventually the chat-tool shims) import this
// factory, build an api object once with their mcp base URL, and read
// through it for all pf2e compendium content.
//
//   const api = createCompendiumApi({ baseUrl: cfg.foundryMcpUrl });
//   const { document } = await api.getCompendiumDocument('Compendium.pf2e.equipment-srd.Item.xxxx');
//
// Document reads are cache-first (TTL-bound). Search is not cached —
// filter combinations are too varied for a meaningful hit rate, and the
// server already serves search from its own in-memory cache.
//
// On HTTP failure during a document read we fall back to any cached row
// we have, even if stale, so the rest of the app keeps working during a
// brief mcp outage. Search failures still throw.

import {
  getCachedDocument,
  getCachedDocumentAllowStale,
  invalidateAllCachedDocuments,
  invalidateCachedDocument,
  putCachedDocument,
} from '@foundry-toolkit/db/pf2e';
import {
  type CompendiumHttpClient,
  CompendiumRequestError,
  createCompendiumHttpClient,
} from './client.js';
import type { CompendiumDocument, CompendiumMatch, CompendiumPack, CompendiumSearchOptions, CompendiumSource } from './types.js';

// Compendium data changes rarely; docs are safe to keep for a month before
// we re-fetch. Invalidate individual uuids on demand when we know the
// server side has shifted.
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreateCompendiumApiOptions {
  /** Base URL of the foundry-mcp server, e.g. `http://localhost:8765`.
   *  Trailing slash is tolerated. */
  baseUrl: string;
  /** Override the default 30-day document TTL. */
  documentTtlMs?: number;
  /** Injection seam for tests. Defaults to the real HTTP client. */
  httpClient?: CompendiumHttpClient;
}

export interface CompendiumApi {
  searchCompendium(opts: CompendiumSearchOptions): Promise<{ matches: CompendiumMatch[] }>;
  getCompendiumDocument(uuid: string): Promise<{ document: CompendiumDocument; stale: boolean }>;
  listCompendiumPacks(opts?: { documentType?: string }): Promise<{ packs: CompendiumPack[] }>;
  listCompendiumSources(
    opts?: { documentType?: string; packIds?: string[]; q?: string; traits?: string[]; maxLevel?: number },
  ): Promise<{ sources: CompendiumSource[] }>;
  invalidateDocument(uuid: string): void;
  invalidateAllDocuments(): void;
}

export function createCompendiumApi(opts: CreateCompendiumApiOptions): CompendiumApi {
  const http = opts.httpClient ?? createCompendiumHttpClient(opts.baseUrl);
  const ttl = opts.documentTtlMs ?? DEFAULT_TTL_MS;

  return {
    searchCompendium(searchOpts) {
      return http.searchCompendium(searchOpts);
    },

    async getCompendiumDocument(uuid) {
      const cached = getCachedDocument<CompendiumDocument>(uuid, ttl);
      if (cached) return { document: cached.body, stale: false };

      try {
        const { document } = await http.getCompendiumDocument(uuid);
        putCachedDocument(uuid, document);
        return { document, stale: false };
      } catch (err) {
        // Network or server failure — fall back to a stale cached row if
        // we have one. A genuine "uuid doesn't exist" still surfaces to
        // the caller because the stale lookup returns null too.
        const stale = getCachedDocumentAllowStale<CompendiumDocument>(uuid);
        if (stale) return { document: stale.body, stale: true };
        throw err instanceof CompendiumRequestError ? err : new Error(`Failed to fetch compendium document: ${String(err)}`);
      }
    },

    listCompendiumPacks(packsOpts) {
      return http.listCompendiumPacks(packsOpts);
    },

    listCompendiumSources(sourcesOpts) {
      return http.listCompendiumSources(sourcesOpts);
    },

    invalidateDocument(uuid) {
      invalidateCachedDocument(uuid);
    },

    invalidateAllDocuments() {
      invalidateAllCachedDocuments();
    },
  };
}

export type { CompendiumApi as default };
export { CompendiumRequestError } from './client.js';
export type {
  ApiError,
  CompendiumDocument,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
  ItemPrice,
} from './types.js';
