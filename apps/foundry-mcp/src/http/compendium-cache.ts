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
  /** Actor-only. Foundry PrototypeToken.texture.src — the token art URL,
   *  distinct from the portrait `img`. Absent for Item documents and
   *  Actors without a configured prototype token. Pass-through only;
   *  search/filter logic doesn't read it. */
  tokenImg?: string;
  system: Record<string, unknown>;
}

// Shape of the lean match emitted by the bridge's find-in-compendium
// handler (plus the `price` field we add when responding from cache).
// Optional fields beyond the bridge baseline are populated during
// cache-served filtering so dm-tool's browser tables can render a
// full row without a follow-up document fetch per result.
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
  rarity?: string;
  size?: string;
  creatureType?: string;
  hp?: number;
  ac?: number;
  fort?: number;
  ref?: number;
  will?: number;
  usage?: string;
  isMagical?: boolean;
  source?: string;
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
  minLevel?: number;
  maxLevel?: number;
  rarities?: string[];
  sizes?: string[];
  creatureTypes?: string[];
  usageCategories?: string[];
  isMagical?: boolean;
  hpMin?: number;
  hpMax?: number;
  acMin?: number;
  acMax?: number;
  fortMin?: number;
  fortMax?: number;
  refMin?: number;
  refMax?: number;
  willMin?: number;
  willMax?: number;
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

        const docTraits = extractTraits(doc);
        const loweredTraits = docTraits.map((t) => t.toLowerCase());
        const creatureType = extractCreatureType(doc, loweredTraits);
        if (creatureType !== undefined) creatureTypes.add(creatureType);

        for (const t of docTraits) traits.add(t);

        const source = extractSource(doc);
        if (source !== undefined) sources.add(source);

        const usage = extractUsage(doc);
        const bucketed = bucketUsage(usage);
        if (bucketed !== undefined) usageCategories.add(bucketed);

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
  // ancestry. dm-tool's browser-only filters (rarity/size/creatureType/
  // usage/isMagical, combat-stat ranges, minLevel) extend this
  // pipeline — they short-circuit to a no-op when the candidate
  // document doesn't carry the field, so searches against item packs
  // aren't penalised by monster-only filters and vice versa.
  private runFilter(packs: readonly CachedPack[], opts: SearchOptions): EnrichedMatch[] {
    const tokens = (opts.q ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const requiredTraits = (opts.traits ?? []).map((t) => t.toLowerCase());
    const anyTraits = (opts.anyTraits ?? []).map((t) => t.toLowerCase());
    const allowedSources = (opts.sources ?? []).map((s) => s.toLowerCase());
    const allowedRarities = (opts.rarities ?? []).map((r) => r.toLowerCase());
    const allowedSizes = (opts.sizes ?? []).map((s) => s.toLowerCase());
    const allowedCreatureTypes = (opts.creatureTypes ?? []).map((c) => c.toLowerCase());
    const allowedUsagePrefixes = (opts.usageCategories ?? []).map((u) => u.toLowerCase());
    const ancestrySlug = opts.ancestrySlug;
    const minLevel = opts.minLevel;
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
        if (minLevel !== undefined && (level === undefined || level < minLevel)) continue;
        if (maxLevel !== undefined && level !== undefined && level > maxLevel) continue;

        const source = extractSource(doc);
        if (allowedSources.length > 0) {
          if (source === undefined) continue;
          if (!allowedSources.includes(source.toLowerCase())) continue;
        }

        if (ancestrySlug !== undefined) {
          const entryAncestrySlug = extractAncestrySlug(doc);
          if (entryAncestrySlug !== undefined && entryAncestrySlug !== null && entryAncestrySlug !== ancestrySlug) {
            continue;
          }
        }

        const rarity = extractRarity(doc);
        if (allowedRarities.length > 0) {
          if (rarity === undefined) continue;
          if (!allowedRarities.includes(rarity.toLowerCase())) continue;
        }

        const size = extractSize(doc);
        if (allowedSizes.length > 0) {
          if (size === undefined) continue;
          if (!allowedSizes.includes(size.toLowerCase())) continue;
        }

        const creatureType = extractCreatureType(doc, loweredTraits);
        if (allowedCreatureTypes.length > 0) {
          if (creatureType === undefined) continue;
          if (!allowedCreatureTypes.includes(creatureType.toLowerCase())) continue;
        }

        const usage = extractUsage(doc);
        if (allowedUsagePrefixes.length > 0) {
          if (usage === undefined) continue;
          const loweredUsage = usage.toLowerCase();
          if (!allowedUsagePrefixes.some((prefix) => loweredUsage.startsWith(prefix))) continue;
        }

        const isMagical = extractIsMagical(doc, loweredTraits);
        if (opts.isMagical !== undefined && isMagical !== opts.isMagical) continue;

        const hp = extractHp(doc);
        if (opts.hpMin !== undefined && (hp === undefined || hp < opts.hpMin)) continue;
        if (opts.hpMax !== undefined && hp !== undefined && hp > opts.hpMax) continue;

        const ac = extractAc(doc);
        if (opts.acMin !== undefined && (ac === undefined || ac < opts.acMin)) continue;
        if (opts.acMax !== undefined && ac !== undefined && ac > opts.acMax) continue;

        const fort = extractSave(doc, 'fortitude');
        if (opts.fortMin !== undefined && (fort === undefined || fort < opts.fortMin)) continue;
        if (opts.fortMax !== undefined && fort !== undefined && fort > opts.fortMax) continue;

        const ref = extractSave(doc, 'reflex');
        if (opts.refMin !== undefined && (ref === undefined || ref < opts.refMin)) continue;
        if (opts.refMax !== undefined && ref !== undefined && ref > opts.refMax) continue;

        const will = extractSave(doc, 'will');
        if (opts.willMin !== undefined && (will === undefined || will < opts.willMin)) continue;
        if (opts.willMax !== undefined && will !== undefined && will > opts.willMax) continue;

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
        if (rarity !== undefined) match.rarity = rarity;
        if (size !== undefined) match.size = size;
        if (creatureType !== undefined) match.creatureType = creatureType;
        if (hp !== undefined) match.hp = hp;
        if (ac !== undefined) match.ac = ac;
        if (fort !== undefined) match.fort = fort;
        if (ref !== undefined) match.ref = ref;
        if (will !== undefined) match.will = will;
        if (usage !== undefined) match.usage = usage;
        if (isMagical !== undefined) match.isMagical = isMagical;
        if (source !== undefined) match.source = source;

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

function extractPrice(doc: CompendiumDocument): ItemPrice | undefined {
  const price = (doc.system as { price?: unknown }).price;
  if (!price || typeof price !== 'object') return undefined;
  const v = (price as { value?: unknown }).value;
  if (!v || typeof v !== 'object') return undefined;
  return price as ItemPrice;
}

// `system.traits.rarity` on pf2e items/actors carries one of
// 'common' | 'uncommon' | 'rare' | 'unique'. Absent on documents
// that don't have a traits block.
function extractRarity(doc: CompendiumDocument): string | undefined {
  const raw = (doc.system as { traits?: { rarity?: unknown } }).traits?.rarity;
  return typeof raw === 'string' ? raw : undefined;
}

// `system.traits.size.value` on pf2e NPC actors carries one of
// 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg'. Items don't have
// this shape, so the field is absent for them.
function extractSize(doc: CompendiumDocument): string | undefined {
  const size = (doc.system as { traits?: { size?: unknown } }).traits?.size;
  if (!size || typeof size !== 'object') return undefined;
  const value = (size as { value?: unknown }).value;
  return typeof value === 'string' ? value : undefined;
}

// Pf2e NPC creature types. Newer module versions expose
// `system.details.creatureType`; older ones list it under
// `system.traits.value` alongside other tags. Try the explicit field
// first, then fall back to intersecting the trait list with the known
// creature-type vocabulary — passing the already-lowercased traits
// saves one pass over the array.
const CREATURE_TYPE_TRAITS = new Set([
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
  'shade',
  'spirit',
  'time',
  'undead',
]);

function extractCreatureType(doc: CompendiumDocument, loweredTraits: readonly string[]): string | undefined {
  const explicit = (doc.system as { details?: { creatureType?: unknown } }).details?.creatureType;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  for (const trait of loweredTraits) {
    if (CREATURE_TYPE_TRAITS.has(trait)) return trait;
  }
  return undefined;
}

// `system.usage.value` on pf2e items carries slugs like
// 'held-in-one-hand', 'worn-necklace', 'etched-onto-a-weapon'. The
// filter does a prefix match so dm-tool can pass 'held' / 'worn' /
// 'etched' / 'affixed' / 'tattooed' without the server having to
// maintain pf2e's full usage taxonomy.
function extractUsage(doc: CompendiumDocument): string | undefined {
  const usage = (doc.system as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const value = (usage as { value?: unknown }).value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Pf2e convention: any item carrying `magical` OR one of the four
// tradition traits (arcane/divine/occult/primal) is magical.
// Returns undefined for documents without a traits array (no basis to
// classify) — the filter short-circuits to no-op in that case.
const TRADITION_TRAITS = new Set(['magical', 'arcane', 'divine', 'occult', 'primal']);
function extractIsMagical(doc: CompendiumDocument, loweredTraits: readonly string[]): boolean | undefined {
  const raw = (doc.system as { traits?: { value?: unknown } }).traits?.value;
  if (!Array.isArray(raw)) return undefined;
  return loweredTraits.some((t) => TRADITION_TRAITS.has(t));
}

// `system.attributes.hp.max` on pf2e NPC actors. Items use
// `system.hp.value` for durability, which we deliberately ignore —
// the hp filter is monster-only.
function extractHp(doc: CompendiumDocument): number | undefined {
  const raw = (doc.system as { attributes?: { hp?: { max?: unknown } } }).attributes?.hp?.max;
  return typeof raw === 'number' ? raw : undefined;
}

// `system.attributes.ac.value` on pf2e NPC actors.
function extractAc(doc: CompendiumDocument): number | undefined {
  const raw = (doc.system as { attributes?: { ac?: { value?: unknown } } }).attributes?.ac?.value;
  return typeof raw === 'number' ? raw : undefined;
}

// `system.saves.<save>.value` on pf2e NPC actors.
function extractSave(doc: CompendiumDocument, save: 'fortitude' | 'reflex' | 'will'): number | undefined {
  const saves = (doc.system as { saves?: Record<string, { value?: unknown } | undefined> }).saves;
  const raw = saves?.[save]?.value;
  return typeof raw === 'number' ? raw : undefined;
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

// Facet-side bucketing of `system.usage.value`. Main's `extractUsage`
// returns the raw slug so `search()` can match with `startsWith` against
// any depth; the facet response needs a bounded taxonomy, so we collapse
// the slug to its leading segment and lump anything outside the known
// set into `'other'`. Keeps the sidebar filter list short and stable.
const USAGE_PREFIX_BUCKETS = new Set(['held', 'worn', 'etched', 'affixed', 'tattooed']);

function bucketUsage(usage: string | undefined): string | undefined {
  if (usage === undefined || usage.length === 0) return undefined;
  const prefix = usage.split('-')[0]?.toLowerCase();
  if (!prefix) return undefined;
  return USAGE_PREFIX_BUCKETS.has(prefix) ? prefix : 'other';
}
