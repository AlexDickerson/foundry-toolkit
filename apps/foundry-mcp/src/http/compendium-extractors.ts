// Field readers for pf2e compendium documents. Used by both
// `compendium-search.ts` (filter pipeline + facet aggregation) and
// other read-side code that needs a single field out of a raw doc.
//
// Every function is defensively typed: pf2e's data model is large and
// inconsistent across item subtypes, so the helpers narrow `unknown`
// step-by-step and return `undefined` when the expected shape isn't
// there. Callers either skip the field or short-circuit the filter
// in that case.

import type { CompendiumDocument, ItemPrice } from './compendium-types.js';

export function extractTraits(doc: CompendiumDocument): string[] {
  const traits = (doc.system as { traits?: { value?: unknown; traditions?: unknown } }).traits;
  const value = Array.isArray(traits?.value)
    ? traits.value.filter((v): v is string => typeof v === 'string')
    : [];
  // pf2e spells store magical-tradition tags (arcane / divine / occult /
  // primal) in `system.traits.traditions`, not `system.traits.value`.
  // Merge them in so trait-based search and filter callsites — including
  // the spell picker's tradition filter — see traditions as regular traits.
  // Other doc types (NPC abilities, magical items) already encode their
  // tradition in `system.traits.value`, so this only affects spells.
  const traditions = Array.isArray(traits?.traditions)
    ? traits.traditions.filter((v): v is string => typeof v === 'string')
    : [];
  if (traditions.length === 0) return value;
  // Merge with dedup. Order: traits.value first, then any tradition not
  // already present.
  const seen = new Set(value);
  const out = [...value];
  for (const t of traditions) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function extractLevel(doc: CompendiumDocument): number | undefined {
  // Item docs store level at `system.level.value` (occasionally as a
  // bare number); NPC actors store it at `system.details.level.value`.
  // Falling through to the NPC form lets `aggregateFacets` aggregate the
  // level range across bestiary packs without a separate extractor.
  const sys = doc.system as { level?: unknown; details?: { level?: unknown } };
  if (typeof sys.level === 'number') return sys.level;
  const itemLevel = sys.level as { value?: unknown } | undefined;
  if (typeof itemLevel?.value === 'number') return itemLevel.value;
  const npcLevel = sys.details?.level as { value?: unknown } | undefined;
  return typeof npcLevel?.value === 'number' ? npcLevel.value : undefined;
}

export function extractSource(doc: CompendiumDocument): string | undefined {
  const raw = (doc.system as { publication?: { title?: unknown } }).publication?.title;
  return typeof raw === 'string' ? raw : undefined;
}

// Heritages/ancestry-bound items: returns the ancestry slug, `null`
// for versatile heritages (pf2e sets `system.ancestry === null`), or
// `undefined` for items that don't carry an ancestry field at all.
export function extractAncestrySlug(doc: CompendiumDocument): string | null | undefined {
  const ancestry = (doc.system as { ancestry?: unknown }).ancestry;
  if (ancestry === null) return null;
  if (!ancestry || typeof ancestry !== 'object') return undefined;
  const slug = (ancestry as { slug?: unknown }).slug;
  return typeof slug === 'string' ? slug : undefined;
}

export function extractPrice(doc: CompendiumDocument): ItemPrice | undefined {
  const price = (doc.system as { price?: unknown }).price;
  if (!price || typeof price !== 'object') return undefined;
  const v = (price as { value?: unknown }).value;
  if (!v || typeof v !== 'object') return undefined;
  return price as ItemPrice;
}

// `system.traits.rarity` on pf2e items/actors carries one of
// 'common' | 'uncommon' | 'rare' | 'unique'. Absent on documents that
// don't have a traits block.
export function extractRarity(doc: CompendiumDocument): string | undefined {
  const raw = (doc.system as { traits?: { rarity?: unknown } }).traits?.rarity;
  return typeof raw === 'string' ? raw : undefined;
}

// `system.traits.size.value` on pf2e NPC actors carries one of
// 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg'. Items don't have
// this shape, so the field is absent for them.
export function extractSize(doc: CompendiumDocument): string | undefined {
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

export function extractCreatureType(doc: CompendiumDocument, loweredTraits: readonly string[]): string | undefined {
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
export function extractUsage(doc: CompendiumDocument): string | undefined {
  const usage = (doc.system as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const value = (usage as { value?: unknown }).value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Pf2e convention: any item carrying `magical` OR one of the four
// tradition traits (arcane/divine/occult/primal) is magical. Returns
// undefined for documents without a traits array (no basis to
// classify) — the filter short-circuits to no-op in that case.
const TRADITION_TRAITS = new Set(['magical', 'arcane', 'divine', 'occult', 'primal']);
export function extractIsMagical(doc: CompendiumDocument, loweredTraits: readonly string[]): boolean | undefined {
  const raw = (doc.system as { traits?: { value?: unknown } }).traits?.value;
  if (!Array.isArray(raw)) return undefined;
  return loweredTraits.some((t) => TRADITION_TRAITS.has(t));
}

// `system.attributes.hp.max` on pf2e NPC actors. Items use
// `system.hp.value` for durability, which we deliberately ignore — the
// hp filter is monster-only.
export function extractHp(doc: CompendiumDocument): number | undefined {
  const raw = (doc.system as { attributes?: { hp?: { max?: unknown } } }).attributes?.hp?.max;
  return typeof raw === 'number' ? raw : undefined;
}

// `system.attributes.ac.value` on pf2e NPC actors.
export function extractAc(doc: CompendiumDocument): number | undefined {
  const raw = (doc.system as { attributes?: { ac?: { value?: unknown } } }).attributes?.ac?.value;
  return typeof raw === 'number' ? raw : undefined;
}

// `system.saves.<save>.value` on pf2e NPC actors.
export function extractSave(doc: CompendiumDocument, save: 'fortitude' | 'reflex' | 'will'): number | undefined {
  const saves = (doc.system as { saves?: Record<string, { value?: unknown } | undefined> }).saves;
  const raw = saves?.[save]?.value;
  return typeof raw === 'number' ? raw : undefined;
}

// Facet-side bucketing of `system.usage.value`. `extractUsage` returns
// the raw slug so the filter can match with `startsWith` against any
// depth; the facet response needs a bounded taxonomy, so we collapse
// the slug to its leading segment and lump anything outside the known
// set into `'other'`. Keeps the sidebar filter list short and stable.
const USAGE_PREFIX_BUCKETS = new Set(['held', 'worn', 'etched', 'affixed', 'tattooed']);

export function bucketUsage(usage: string | undefined): string | undefined {
  if (usage === undefined || usage.length === 0) return undefined;
  const prefix = usage.split('-')[0]?.toLowerCase();
  if (!prefix) return undefined;
  return USAGE_PREFIX_BUCKETS.has(prefix) ? prefix : 'other';
}

// Rank tiers, lower is better:
//   0 — exact match
//   1 — starts with the query
//   2 — contains the query as a substring
//   3 — all tokens appear somewhere in the name
// `runFilter` adds rank 4 when the match was trait-only (no tokens in
// the name). The bridge uses the same scale so our ordering matches.
export function score(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  return 3;
}
