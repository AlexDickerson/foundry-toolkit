// Pure read-side logic over warmed compendium packs. Both
// `runFilter` and `aggregateFacets` walk a `CachedPack[]` and read
// fields out of each document via the helpers in
// `compendium-extractors.ts`. The CompendiumCache class delegates to
// these once it has located the requested packs in its in-memory map.
//
// Keeping these as pure functions means tests can call them directly
// without instantiating a cache or stubbing the bridge sendCommand —
// they just need a hand-rolled CachedPack[].

import type { CompendiumFacets } from '@foundry-toolkit/shared/foundry-api';

import {
  bucketUsage,
  extractAc,
  extractAncestrySlug,
  extractCreatureType,
  extractHp,
  extractIsMagical,
  extractLevel,
  extractPrice,
  extractRarity,
  extractSave,
  extractSize,
  extractSource,
  extractTraits,
  extractUsage,
  score,
} from './compendium-extractors.js';
import type { CachedPack, EnrichedMatch, SearchOptions } from './compendium-types.js';

// Filter + rank + sort, mirroring foundry-api-bridge's
// FindInCompendiumHandler. Keep the behaviour aligned: text tokens
// match in name OR traits, with a rank penalty for trait-only matches;
// AND-traits and OR-anyTraits filter, then level, source, ancestry.
// dm-tool's browser-only filters (rarity / size / creatureType / usage
// / isMagical, combat-stat ranges, minLevel) extend this pipeline —
// they short-circuit to a no-op when the candidate document doesn't
// carry the field, so searches against item packs aren't penalised by
// monster-only filters and vice versa.
export function runFilter(packs: readonly CachedPack[], opts: SearchOptions): EnrichedMatch[] {
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
        // Bridge accepts 'Item' as a wildcard for every item subtype;
        // any other documentType filters exactly.
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

// Aggregate DISTINCT facet values over every document in the requested
// packs. Iteration is microseconds over a few thousand docs — no need
// to memoize beyond the warm cache itself. Callers must call this
// after every warm because the cache doesn't invalidate the result
// set.
export function aggregateFacets(
  packs: readonly CachedPack[],
  opts: { documentType?: string } = {},
): CompendiumFacets {
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
        // Align with `runFilter`'s wildcard semantics: 'Item' matches
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
