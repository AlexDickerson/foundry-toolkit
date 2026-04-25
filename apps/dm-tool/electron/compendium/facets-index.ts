// Client-side aggregator that turns a single wide compendium search into
// the `MonsterFacets` / `ItemFacets` shapes the filter panels expect.
//
// This is the primary path until foundry-mcp exposes a server-side
// `/api/compendium/facets` endpoint; once that lands, the facades in
// `prepared.ts` can hit it directly and leave this module for tests or as
// a fallback. Until then, we pay the one-time cost of pulling every
// match in a pack and folding them into distinct-value sets in memory.
//
// The result is memoised for the process lifetime — facets change rarely,
// and invalidation is a manual `resetFacetsIndex()` call (currently only
// exposed for tests; a consumer can wire a "clear cache" UI action later).

import type { ItemFacets, MonsterFacets } from '@foundry-toolkit/shared/types';
import type { CompendiumApi } from './index.js';
import type { CompendiumMatch } from './types.js';

/** Large enough to cover the full SRD bestiary / equipment list in a single
 *  pass; the server clamps this to its own max. */
const AGGREGATION_LIMIT = 10000;

const DEFAULT_MONSTER_PACK_IDS = ['pf2e.pathfinder-bestiary'];
const DEFAULT_ITEM_PACK_IDS = ['pf2e.equipment-srd'];

const KNOWN_CREATURE_TYPES = [
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
];

const RARITY_TRAITS = new Set(['common', 'uncommon', 'rare', 'unique']);
const SIZE_TRAITS = new Set(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);

let monsterCache: MonsterFacets | null = null;
let itemCache: ItemFacets | null = null;

export function resetFacetsIndex(): void {
  monsterCache = null;
  itemCache = null;
}

// ---------------------------------------------------------------------------
// Monster facets
// ---------------------------------------------------------------------------

function aggregateMonsterFacets(matches: CompendiumMatch[]): MonsterFacets {
  const rarities = new Set<string>();
  const sizes = new Set<string>();
  const creatureTypes = new Set<string>();
  const traits = new Set<string>();
  let minLevel = Infinity;
  let maxLevel = -Infinity;

  for (const m of matches) {
    if (typeof m.level === 'number') {
      if (m.level < minLevel) minLevel = m.level;
      if (m.level > maxLevel) maxLevel = m.level;
    }
    // Rarity is stored in system.traits.rarity (a scalar) by the MCP server,
    // not in the traits value array. Read the dedicated field first; fall back
    // to scanning traits for legacy / alternative data sources.
    if (m.rarity) {
      rarities.add(m.rarity.toLowerCase());
    }
    const mTraits = m.traits ?? [];
    for (const t of mTraits) {
      const lower = t.toLowerCase();
      if (RARITY_TRAITS.has(lower)) {
        rarities.add(lower); // fallback: rarity string present in traits array
      } else if (SIZE_TRAITS.has(lower)) {
        sizes.add(lower);
      } else if (KNOWN_CREATURE_TYPES.includes(lower)) {
        creatureTypes.add(lower.charAt(0).toUpperCase() + lower.slice(1));
      } else {
        traits.add(t);
      }
    }
  }

  // Ensure the rarity list is never empty — 'common' is always valid even
  // if every monster in the cached set lacked an explicit rarity trait.
  if (rarities.size === 0) rarities.add('common');

  return {
    rarities: [...rarities].sort(),
    sizes: [...sizes].sort(),
    creatureTypes: [...creatureTypes].sort(),
    traits: [...traits].sort(),
    sources: [], // Sources need a separate `/api/compendium/sources` call.
    levelRange: [minLevel === Infinity ? 0 : minLevel, maxLevel === -Infinity ? 0 : maxLevel],
  };
}

export async function getMonsterFacetsIndex(
  api: CompendiumApi,
  opts: { packIds?: string[] } = {},
): Promise<MonsterFacets> {
  if (monsterCache) return monsterCache;

  const packIds = opts.packIds ?? DEFAULT_MONSTER_PACK_IDS;
  const { matches } = await api.searchCompendium({
    documentType: 'npc',
    packIds,
    limit: AGGREGATION_LIMIT,
  });

  const facets = aggregateMonsterFacets(matches);

  // Sources come from the dedicated endpoint — compose it in here so the
  // caller gets a fully-populated `MonsterFacets`. If the endpoint fails
  // (older mcp build), swallow the error and keep the empty array.
  try {
    const { sources } = await api.listCompendiumSources({ documentType: 'npc', packIds });
    facets.sources = sources.map((s) => s.title).sort();
  } catch {
    // fall through — sources remain empty
  }

  monsterCache = facets;
  return facets;
}

// ---------------------------------------------------------------------------
// Item facets
// ---------------------------------------------------------------------------

const USAGE_BUCKET_ORDER = ['Held', 'Worn', 'Etched', 'Affixed', 'Tattooed', 'Carried', 'Other'];

function bucketUsage(usage: string | undefined | null): string {
  if (!usage) return 'Other';
  const u = usage.toLowerCase();
  if (u.startsWith('held')) return 'Held';
  if (u.startsWith('worn')) return 'Worn';
  if (u.startsWith('etched')) return 'Etched';
  if (u.startsWith('affixed')) return 'Affixed';
  if (u.startsWith('tattooed')) return 'Tattooed';
  if (u === 'carried') return 'Carried';
  return 'Other';
}

function aggregateItemFacets(matches: CompendiumMatch[]): ItemFacets {
  const traitCounts = new Map<string, number>();
  const usageBuckets = new Set<string>();

  for (const m of matches) {
    for (const t of m.traits ?? []) {
      if (RARITY_TRAITS.has(t.toLowerCase())) continue;
      const key = t.toUpperCase();
      traitCounts.set(key, (traitCounts.get(key) ?? 0) + 1);
    }
    // The match row doesn't currently carry usage. We seed the buckets
    // with the full canonical list so the filter panel has every option
    // visible even before per-item usage data makes it onto matches.
  }
  for (const bucket of USAGE_BUCKET_ORDER) usageBuckets.add(bucket);

  const traits = [...traitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([t]) => t);

  return {
    traits,
    sources: [],
    usageCategories: [...usageBuckets].sort(),
  };
}

export async function getItemFacetsIndex(api: CompendiumApi, opts: { packIds?: string[] } = {}): Promise<ItemFacets> {
  if (itemCache) return itemCache;

  const packIds = opts.packIds ?? DEFAULT_ITEM_PACK_IDS;
  const { matches } = await api.searchCompendium({
    documentType: 'Item',
    packIds,
    limit: AGGREGATION_LIMIT,
  });

  const facets = aggregateItemFacets(matches);

  try {
    const { sources } = await api.listCompendiumSources({ documentType: 'Item', packIds });
    facets.sources = sources.map((s) => s.title).sort();
  } catch {
    // fall through — sources remain empty
  }

  // Usage buckets are canonical; keep them in UI-friendly order rather
  // than alphabetic so e.g. "Held" appears before "Other" even under sort.
  facets.usageCategories = USAGE_BUCKET_ORDER.filter((b) => facets.usageCategories.includes(b));

  itemCache = facets;
  return facets;
}

// Exported for tests so they can exercise the fold logic directly without
// going through the cache-flush dance.
export const __internal = {
  aggregateMonsterFacets,
  aggregateItemFacets,
  bucketUsage,
};
