// In-memory cache of entire compendium packs, keyed by packId. Stores
// the full documents returned by `get-compendium-document` so both
// search and document-fetch requests can be served without a
// round-trip to the Foundry bridge.
//
// Motivation: the shop-browsing UI in foundry-character-creator was
// firing one `get-compendium-document` per search result to read
// prices, which explodes in cost for anything beyond a narrow search.
// Caching the whole pack collapses that into a constant-time lookup.
//
// The filter/sort logic here intentionally mirrors the bridge's
// `FindInCompendiumHandler` so cached responses are indistinguishable
// from bridge responses. Any pack that isn't warmed falls through to
// the bridge unchanged.

import type { CompendiumFacets } from '@foundry-toolkit/shared/foundry-api';
import { log } from '../logger.js';

// Subset of a Foundry compendium document that we care about for
// filtering. The cache stores the raw document as delivered by
// `get-compendium-document`; this interface documents the fields we
// *read* during filter/sort.
export interface CompendiumDocument {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
}

// Shape of the lean match emitted by the bridge's find-in-compendium
// handler (plus the `price` field we add when responding from cache).
export interface EnrichedMatch {
  packId: string;
  packLabel: string;
  documentId: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  level?: number;
  traits?: string[];
  isVersatile?: boolean;
  price?: ItemPrice;
}

export interface ItemPrice {
  value: Partial<Record<'pp' | 'gp' | 'sp' | 'cp', number>>;
  per?: number;
}

export interface SearchOptions {
  q?: string;
  packIds?: string[];
  documentType?: string;
  traits?: string[];
  anyTraits?: string[];
  sources?: string[];
  ancestrySlug?: string;
  maxLevel?: number;
  limit?: number;
}

interface CachedPack {
  packId: string;
  packLabel: string;
  docs: Map<string, CompendiumDocument>;
  docList: CompendiumDocument[];
  warmedAt: number;
  bytes: number;
}

export interface CompendiumCacheStats {
  packs: string[];
  docs: number;
  bytes: number;
  hits: number;
  misses: number;
  warmings: number;
  warmFailures: number;
}

// Abstraction of the bridge `sendCommand` so the cache is testable
// against a mock instead of a live WebSocket.
export type SendCommand = (type: string, params?: Record<string, unknown>) => Promise<unknown>;

// Cap for the single `dump-compendium-pack` call. Larger than any
// current pf2e pack (equipment-srd is ~5.6k items) with headroom so a
// single round-trip hydrates the whole pack. Falls back to per-item
// `get-compendium-document` with bounded concurrency when the bridge
// doesn't support the bulk command (older modules).
const WARM_PACK_FETCH_LIMIT = 10_000;

// Fallback concurrency when we have to stream individual
// `get-compendium-document` calls (older bridge without the
// dump-compendium-pack command). Foundry's main thread serializes
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

  // Warm a single pack. Pulls the index via find-in-compendium with a
  // high limit (no filters), then hydrates each entry through
  // get-compendium-document with bounded concurrency. Idempotent:
  // re-warming while a warm is in flight piggybacks on the existing
  // promise.
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

  // Preferred path: one `dump-compendium-pack` round-trip hydrates
  // the whole pack in a single Foundry `pack.getDocuments()` call.
  // Drops a 5.6k-item pack from 60-90s (one WS round-trip per doc)
  // down to a handful of seconds — Foundry's bulk hydration is far
  // cheaper than N × fromUuid. Falls back to per-item fetches when
  // the bridge is an older build without the command.
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
  // dump-compendium-pack.
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
  search(opts: SearchOptions): { matches: EnrichedMatch[] } | null {
    const requested = opts.packIds ?? Array.from(this.packs.keys());
    if (requested.length === 0) {
      this.misses++;
      return null;
    }
    const packs: CachedPack[] = [];
    for (const id of requested) {
      const pack = this.packs.get(id);
      if (!pack) {
        this.misses++;
        return null;
      }
      packs.push(pack);
    }

    this.hits++;
    const matches = this.runFilter(packs, opts);
    const limit = opts.limit ?? 100;
    return { matches: matches.slice(0, limit) };
  }

  // Aggregate DISTINCT facet values over every document in the
  // requested packs. Mirrors `search()`'s contract: returns null when
  // ANY requested pack is not cached so the caller can warm then retry.
  // Passing no packIds means "all cached packs"; no cached packs returns
  // null too.
  //
  // The iteration is microseconds over a few thousand docs — no need to
  // memoize beyond the warm cache itself. Callers must call this after
  // every warm because the cache doesn't invalidate the result set.
  facets(opts: { packIds?: string[]; documentType?: string } = {}): CompendiumFacets | null {
    const requested = opts.packIds ?? Array.from(this.packs.keys());
    if (requested.length === 0) {
      this.misses++;
      return null;
    }
    const packs: CachedPack[] = [];
    for (const id of requested) {
      const pack = this.packs.get(id);
      if (!pack) {
        this.misses++;
        return null;
      }
      packs.push(pack);
    }

    this.hits++;
    const documentType = opts.documentType;

    const rarities = new Set<string>();
    const sizes = new Set<string>();
    const creatureTypes = new Set<string>();
    const traits = new Set<string>();
    const sources = new Set<string>();
    const usageCategories = new Set<string>();
    let minLevel = Number.POSITIVE_INFINITY;
    let maxLevel = Number.NEGATIVE_INFINITY;

    for (const pack of packs) {
      for (const doc of pack.docList) {
        if (documentType !== undefined && doc.type !== documentType && documentType !== 'Item') {
          // Align with `search()`'s wildcard semantics: 'Item' matches
          // every item subtype, anything else is an exact type filter.
          continue;
        }

        const rarity = extractRarity(doc);
        if (rarity !== undefined) rarities.add(rarity);

        const size = extractSize(doc);
        if (size !== undefined) sizes.add(size);

        const creatureType = extractCreatureType(doc);
        if (creatureType !== undefined) creatureTypes.add(creatureType);

        for (const t of extractTraits(doc)) traits.add(t);

        const source = extractSource(doc);
        if (source !== undefined) sources.add(source);

        const usage = extractUsage(doc);
        if (usage !== undefined) usageCategories.add(usage);

        const level = extractLevel(doc);
        if (level !== undefined) {
          if (level < minLevel) minLevel = level;
          if (level > maxLevel) maxLevel = level;
        }
      }
    }

    const sortAsc = (a: string, b: string): number => a.localeCompare(b);
    return {
      rarities: [...rarities].sort(sortAsc),
      sizes: [...sizes].sort(sortAsc),
      creatureTypes: [...creatureTypes].sort(sortAsc),
      traits: [...traits].sort(sortAsc),
      sources: [...sources].sort(sortAsc),
      usageCategories: [...usageCategories].sort(sortAsc),
      levelRange: Number.isFinite(minLevel) ? [minLevel, maxLevel] : null,
    };
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

  // Filter + rank + sort, mirroring foundry-api-bridge's
  // FindInCompendiumHandler. Keep the behaviour aligned: text tokens
  // match in name OR traits, with a rank penalty for trait-only
  // matches; AND-traits and OR-anyTraits filter, then level, source,
  // ancestry.
  private runFilter(packs: readonly CachedPack[], opts: SearchOptions): EnrichedMatch[] {
    const tokens = (opts.q ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const requiredTraits = (opts.traits ?? []).map((t) => t.toLowerCase());
    const anyTraits = (opts.anyTraits ?? []).map((t) => t.toLowerCase());
    const allowedSources = (opts.sources ?? []).map((s) => s.toLowerCase());
    const ancestrySlug = opts.ancestrySlug;
    const maxLevel = opts.maxLevel;
    const documentType = opts.documentType;

    interface Scored extends EnrichedMatch {
      rank: number;
    }
    const out: Scored[] = [];

    for (const pack of packs) {
      for (const doc of pack.docList) {
        if (documentType !== undefined && doc.type !== documentType && documentType !== 'Item') {
          // Bridge accepts 'Item' as a wildcard for every item
          // subtype; any other documentType filters exactly.
          continue;
        }
        const name = doc.name;
        const lower = name.toLowerCase();
        const traits = extractTraits(doc);
        const loweredTraits = traits.map((t) => t.toLowerCase());

        let allTokensInName = true;
        if (tokens.length > 0) {
          let ok = true;
          for (const tok of tokens) {
            const inName = lower.includes(tok);
            const inTraits = loweredTraits.some((t) => t.includes(tok));
            if (!inName && !inTraits) {
              ok = false;
              break;
            }
            if (!inName) allTokensInName = false;
          }
          if (!ok) continue;
        }

        if (requiredTraits.length > 0 && !requiredTraits.every((r) => loweredTraits.includes(r))) continue;
        if (anyTraits.length > 0 && !loweredTraits.some((t) => anyTraits.includes(t))) continue;

        const level = extractLevel(doc);
        if (maxLevel !== undefined && level !== undefined && level > maxLevel) continue;

        if (allowedSources.length > 0) {
          const source = extractSource(doc);
          if (source === undefined) continue;
          if (!allowedSources.includes(source.toLowerCase())) continue;
        }

        if (ancestrySlug !== undefined) {
          const entryAncestrySlug = extractAncestrySlug(doc);
          if (entryAncestrySlug !== undefined && entryAncestrySlug !== null && entryAncestrySlug !== ancestrySlug) {
            continue;
          }
        }

        const match: Scored = {
          packId: pack.packId,
          packLabel: pack.packLabel,
          documentId: doc.id,
          uuid: doc.uuid,
          name,
          type: doc.type,
          img: doc.img,
          rank: tokens.length > 0 ? (allTokensInName ? score(lower, tokens.join(' ')) : 4) : 0,
        };

        if (level !== undefined) match.level = level;
        if (traits.length > 0) match.traits = traits;
        if (extractAncestrySlug(doc) === null) match.isVersatile = true;
        const price = extractPrice(doc);
        if (price) match.price = price;

        out.push(match);
      }
    }

    out.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.name.localeCompare(b.name);
    });

    // Strip the internal `rank` field from the outgoing matches.
    return out.map(({ rank: _rank, ...rest }) => rest);
  }
}

// Rank tiers, lower is better:
//   0 — exact match
//   1 — starts with the query
//   2 — contains the query as a substring
//   3 — all tokens appear somewhere in the name
// The bridge uses the same 0-3 scale so our ordering matches.
function score(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  return 3;
}

function extractTraits(doc: CompendiumDocument): string[] {
  const raw = (doc.system as { traits?: { value?: unknown } }).traits?.value;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function extractLevel(doc: CompendiumDocument): number | undefined {
  // Item docs store level at `system.level.value` (occasionally as a
  // bare number); NPC actors store it at `system.details.level.value`.
  // Falling through to the NPC form lets `facets()` aggregate the level
  // range across bestiary packs without a separate extractor.
  const sys = doc.system as { level?: unknown; details?: { level?: unknown } };
  if (typeof sys.level === 'number') return sys.level;
  const itemLevel = sys.level as { value?: unknown } | undefined;
  if (typeof itemLevel?.value === 'number') return itemLevel.value;
  const npcLevel = sys.details?.level as { value?: unknown } | undefined;
  return typeof npcLevel?.value === 'number' ? npcLevel.value : undefined;
}

function extractSource(doc: CompendiumDocument): string | undefined {
  const raw = (doc.system as { publication?: { title?: unknown } }).publication?.title;
  return typeof raw === 'string' ? raw : undefined;
}

// Heritages/ancestry-bound items: returns the ancestry slug, `null`
// for versatile heritages (pf2e sets `system.ancestry === null`), or
// `undefined` for items that don't carry an ancestry field at all.
function extractAncestrySlug(doc: CompendiumDocument): string | null | undefined {
  const ancestry = (doc.system as { ancestry?: unknown }).ancestry;
  if (ancestry === null) return null;
  if (!ancestry || typeof ancestry !== 'object') return undefined;
  const slug = (ancestry as { slug?: unknown }).slug;
  return typeof slug === 'string' ? slug : undefined;
}

// Canonical PF2e creature-type traits. An NPC's creature type is
// derived from whichever of these appears on `system.traits.value`;
// items never carry them so their `creatureTypes` facet stays empty.
// Kept in sync with
// https://2e.aonprd.com/Rules.aspx?ID=2419 (Creature Traits).
const CREATURE_TYPE_TRAITS = new Set<string>([
  'aberration',
  'animal',
  'astral',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'dream',
  'elemental',
  'ethereal',
  'fey',
  'fiend',
  'fungus',
  'giant',
  'humanoid',
  'monitor',
  'ooze',
  'plant',
  'spirit',
  'time',
  'undead',
]);

// Usage-slug prefix buckets. The prefix is the first `-`-separated
// token of `system.usage.value` (e.g. `held-in-one-hand` → `held`,
// `worn-necklace` → `worn`). Anything whose prefix isn't in this set
// falls into `'other'`.
const USAGE_PREFIXES = new Set<string>(['held', 'worn', 'etched', 'affixed', 'tattooed']);

function extractRarity(doc: CompendiumDocument): string | undefined {
  // NPCs store rarity at `system.traits.rarity`; physical items at
  // `system.traits.rarity` as well (same shape, different prominence).
  // Common is a real value — we don't filter it out, so the filter UI
  // can surface it as a bucket.
  const raw = (doc.system as { traits?: { rarity?: unknown } }).traits?.rarity;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function extractSize(doc: CompendiumDocument): string | undefined {
  // Actors keep size at `system.traits.size.value` (e.g. 'med', 'lg').
  // Item docs don't carry a top-level size field — `undefined` skips
  // them, keeping the item-facet `sizes` array empty as expected.
  const raw = (doc.system as { traits?: { size?: { value?: unknown } } }).traits?.size?.value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function extractCreatureType(doc: CompendiumDocument): string | undefined {
  // First trait on the doc that matches a canonical creature-type
  // token (see CREATURE_TYPE_TRAITS). An NPC always carries exactly
  // one of these in practice; items never do, so this correctly
  // returns undefined for them.
  for (const t of extractTraits(doc)) {
    if (CREATURE_TYPE_TRAITS.has(t.toLowerCase())) return t.toLowerCase();
  }
  return undefined;
}

function extractUsage(doc: CompendiumDocument): string | undefined {
  // Bucket by the usage-slug prefix so the sidebar surfaces a small
  // set of categories (held / worn / etched / affixed / tattooed /
  // other) rather than every slug variant.
  const raw = (doc.system as { usage?: { value?: unknown } }).usage?.value;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const prefix = raw.split('-')[0]?.toLowerCase();
  if (!prefix) return undefined;
  return USAGE_PREFIXES.has(prefix) ? prefix : 'other';
}

function extractPrice(doc: CompendiumDocument): ItemPrice | undefined {
  const price = (doc.system as { price?: unknown }).price;
  if (!price || typeof price !== 'object') return undefined;
  const v = (price as { value?: unknown }).value;
  if (!v || typeof v !== 'object') return undefined;
  return price as ItemPrice;
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
