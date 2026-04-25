// In-memory cache of entire compendium packs, keyed by packId. Stores
// the full documents returned by `get-compendium-document` so both
// search and document-fetch requests can be served without a
// round-trip to the Foundry bridge.
//
// Motivation: the shop-browsing UI in player-portal was firing one
// `get-compendium-document` per search result to read prices, which
// explodes in cost for anything beyond a narrow search. Caching the
// whole pack collapses that into a constant-time lookup.
//
// Read-side filtering and facet aggregation live in
// `compendium-search.ts`; the per-field readers they share live in
// `compendium-extractors.ts`. This file owns the pack lifecycle (warm
// orchestration + storage) plus the small public API the HTTP routes
// call into.
//
// The filter logic mirrors the bridge's `FindInCompendiumHandler` so
// cached responses are indistinguishable from bridge responses. Any
// pack that isn't warmed falls through to the bridge unchanged.

import type { CompendiumFacets } from '@foundry-toolkit/shared/foundry-api';

import { log } from '../logger.js';
import { aggregateFacets, runFilter } from './compendium-search.js';
import type {
  CachedPack,
  CompendiumCacheStats,
  CompendiumDocument,
  EnrichedMatch,
  SearchOptions,
  SendCommand,
} from './compendium-types.js';

// Re-export the public types so existing imports from this module
// (e.g. `import { CompendiumCache, type CompendiumDocument } from
// './compendium-cache.js'`) keep working without churning consumers.
export type {
  CompendiumCacheStats,
  CompendiumDocument,
  EnrichedMatch,
  ItemPrice,
  SearchOptions,
  SendCommand,
} from './compendium-types.js';

// Cap for the legacy `find-in-compendium` index call. Larger than any
// current pf2e pack (equipment-srd is ~5.6k items) with headroom so a
// single round-trip lists every uuid. Only used in the per-doc
// fallback path; the `dump-compendium-pack` fast path doesn't need a
// limit.
const WARM_PACK_FETCH_LIMIT = 10_000;

// Fallback concurrency when we have to stream individual
// `get-compendium-document` calls (older bridge without the
// `dump-compendium-pack` command). Foundry's main thread serializes
// doc hydration, so raising this past ~8 doesn't help in practice.
const WARM_DOC_FETCH_CONCURRENCY = 8;

export class CompendiumCache {
  private readonly packs = new Map<string, CachedPack>();
  private readonly warming = new Map<string, Promise<void>>();
  private hits = 0;
  private misses = 0;
  private warmings = 0;
  private warmFailures = 0;

  constructor(private readonly sendCommand: SendCommand) {}

  // Fire-and-forget: warm multiple packs concurrently. Individual
  // failures are swallowed (logged) so one missing pack doesn't halt
  // the others.
  warmAll(packIds: readonly string[]): Promise<void[]> {
    return Promise.all(
      packIds.map(async (packId) => {
        try {
          await this.warmPack(packId);
        } catch (err) {
          this.warmFailures++;
          log.warn(`compendium-cache: warm failed for ${packId}: ${errMsg(err)}`);
        }
      }),
    );
  }

  // Warm a single pack. Idempotent: re-warming while a warm is in
  // flight piggybacks on the existing promise; a re-warm of an
  // already-warmed pack is a no-op.
  warmPack(packId: string): Promise<void> {
    const existing = this.warming.get(packId);
    if (existing) return existing;
    if (this.packs.has(packId)) return Promise.resolve();

    const promise = this.doWarm(packId).finally(() => {
      this.warming.delete(packId);
    });
    this.warming.set(packId, promise);
    return promise;
  }

  private async doWarm(packId: string): Promise<void> {
    this.warmings++;
    const t0 = Date.now();
    // Errors bubble to `warmAll` so they're logged in one place. An
    // inner catch would produce duplicate messages.

    // Preferred path: one `dump-compendium-pack` round-trip hydrates
    // the whole pack in a single Foundry `pack.getDocuments()` call.
    // Drops a 5.6k-item pack from 60-90s (one WS round-trip per doc)
    // down to a handful of seconds — Foundry's bulk hydration is far
    // cheaper than N × fromUuid. Falls back to individual fetches when
    // the bridge is an older build without the command.
    const fetched = await this.fetchPackFast(packId);
    const documents = fetched.documents;
    const packLabel = fetched.packLabel;

    if (documents.length === 0) {
      log.info(`compendium-cache: ${packId} has no matches — skipping warm`);
      this.packs.set(packId, {
        packId,
        packLabel,
        docs: new Map(),
        docList: [],
        warmedAt: Date.now(),
        bytes: 0,
      });
      return;
    }

    const docs = new Map<string, CompendiumDocument>();
    let bytes = 0;
    for (const doc of documents) {
      docs.set(doc.uuid, doc);
      bytes += estimateBytes(doc);
    }
    const docList = [...documents].sort((a, b) => a.name.localeCompare(b.name));

    this.packs.set(packId, {
      packId,
      packLabel,
      docs,
      docList,
      warmedAt: Date.now(),
      bytes,
    });
    log.info(
      `compendium-cache: warmed ${packId} — ${docList.length.toString()} docs, ${(bytes / (1024 * 1024)).toFixed(1)} MiB, ${Date.now() - t0}ms`,
    );
  }

  private async fetchPackFast(packId: string): Promise<{ packLabel: string; documents: CompendiumDocument[] }> {
    try {
      const dumpResult = (await this.sendCommand('dump-compendium-pack', { packId })) as {
        packId: string;
        packLabel: string;
        documents: CompendiumDocument[];
      };
      return { packLabel: dumpResult.packLabel, documents: dumpResult.documents };
    } catch (err) {
      const msg = errMsg(err);
      // "No handler registered..." / "Unknown command..." mean the
      // bridge is a pre-dump build; fall back to the per-document
      // path. Any other failure is a genuine error — rethrow.
      if (!/no handler/i.test(msg) && !/unknown command/i.test(msg)) throw err;
      log.info(`compendium-cache: bridge lacks dump-compendium-pack, falling back to per-doc warming`);
      return this.fallbackFetchPack(packId);
    }
  }

  // Legacy warm path: list uuids via find-in-compendium, then hydrate
  // each one via get-compendium-document with bounded concurrency.
  // Only hit when the bridge is too old to understand
  // `dump-compendium-pack`.
  private async fallbackFetchPack(packId: string): Promise<{ packLabel: string; documents: CompendiumDocument[] }> {
    const indexResult = (await this.sendCommand('find-in-compendium', {
      name: '',
      packId,
      limit: WARM_PACK_FETCH_LIMIT,
    })) as { matches: Array<{ uuid: string; packId: string; packLabel: string }> };

    if (!Array.isArray(indexResult.matches) || indexResult.matches.length === 0) {
      return { packLabel: packId, documents: [] };
    }

    const packLabel = indexResult.matches[0]?.packLabel ?? packId;
    const documents: CompendiumDocument[] = [];
    const queue = [...indexResult.matches];
    const workers = Array.from({ length: Math.min(WARM_DOC_FETCH_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) break;
        try {
          const result = (await this.sendCommand('get-compendium-document', { uuid: entry.uuid })) as {
            document: CompendiumDocument;
          };
          if (!result.document) continue;
          documents.push(result.document);
        } catch (err) {
          log.warn(`compendium-cache: failed to load ${entry.uuid}: ${errMsg(err)}`);
        }
      }
    });
    await Promise.all(workers);
    return { packLabel, documents };
  }

  hasPack(packId: string): boolean {
    return this.packs.has(packId);
  }

  // Serve a search request from cache. Returns null when ANY requested
  // packId is not cached, so the caller can fall back to the bridge
  // (partial cache-hits would return misleading results). Passing no
  // packIds means "all cached packs"; if nothing is cached, returns
  // null too so the caller still goes to the bridge.
  //
  // Response always includes `total` — the number of items matching
  // the filters before any pagination slice — so callers can determine
  // whether there are more pages to fetch.
  search(opts: SearchOptions): { matches: EnrichedMatch[]; total: number } | null {
    const packs = this.lookup(opts.packIds);
    if (packs === null) return null;
    this.hits++;
    const all = runFilter(packs, opts);
    const total = all.length;
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    return { matches: all.slice(offset, offset + limit), total };
  }

  // Aggregate DISTINCT facet values over every document in the
  // requested packs. Mirrors `search()`'s contract: returns null when
  // ANY requested pack is not cached so the caller can warm then
  // retry.
  facets(opts: { packIds?: string[]; documentType?: string } = {}): CompendiumFacets | null {
    const packs = this.lookup(opts.packIds);
    if (packs === null) return null;
    this.hits++;
    return aggregateFacets(packs, { documentType: opts.documentType });
  }

  // Resolve `packIds` to the concrete CachedPack list, or null if
  // anything is missing. Centralises the miss-bookkeeping that
  // `search` and `facets` share.
  private lookup(packIds: readonly string[] | undefined): CachedPack[] | null {
    const requested = packIds ?? Array.from(this.packs.keys());
    if (requested.length === 0) {
      this.misses++;
      return null;
    }
    const out: CachedPack[] = [];
    for (const id of requested) {
      const pack = this.packs.get(id);
      if (!pack) {
        this.misses++;
        return null;
      }
      out.push(pack);
    }
    return out;
  }

  getDocument(uuid: string): CompendiumDocument | null {
    for (const pack of this.packs.values()) {
      const doc = pack.docs.get(uuid);
      if (doc) {
        this.hits++;
        return doc;
      }
    }
    this.misses++;
    return null;
  }

  stats(): CompendiumCacheStats {
    let docs = 0;
    let bytes = 0;
    for (const pack of this.packs.values()) {
      docs += pack.docList.length;
      bytes += pack.bytes;
    }
    return {
      packs: Array.from(this.packs.keys()),
      docs,
      bytes,
      hits: this.hits,
      misses: this.misses,
      warmings: this.warmings,
      warmFailures: this.warmFailures,
    };
  }

  /** Test/ops helper — drop everything. */
  clear(): void {
    this.packs.clear();
    this.warming.clear();
    this.hits = 0;
    this.misses = 0;
    this.warmings = 0;
    this.warmFailures = 0;
  }
}

function estimateBytes(doc: CompendiumDocument): number {
  // Rough size estimate — good enough for ops/memory reporting.
  // JSON.stringify is O(doc) and we only compute it once per doc at
  // warm time, so the cost is acceptable.
  try {
    return JSON.stringify(doc).length;
  } catch {
    return 0;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
