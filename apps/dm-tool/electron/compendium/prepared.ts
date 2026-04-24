// Async facade exposing dm-tool-shaped accessors backed by the
// foundry-mcp-backed `CompendiumApi`. Mirrors the function signatures
// being replaced in `packages/db/src/pf2e/compendium.ts` so consumer
// sites can swap their import in follow-up PRs with a one-line change.
//
// None of this PR's scope flips consumers — those live in:
//   • electron/ipc/monsters.ts
//   • electron/ipc/items.ts
//   • electron/ipc/combat.ts
//   • electron/ipc/config.ts
//   • electron/ipc/chat.ts
// Each flip ships as its own small PR so a regression can be bisected
// to one IPC handler rather than the whole projection layer at once.
//
// Client-side filtering: several filter fields the legacy SQL path
// supports (hp/ac/saves ranges, min/max level, rarity, size, creature
// type, source, per-creature-type traits) aren't on the wire contract
// `CompendiumSearchOptions` yet. We fetch a wide set via the fields we
// do have and post-filter in JS. The cost is one extra pass over a few
// thousand rows per call — negligible compared to the network round-trip.
// When the server adds native support for these filters, we can strip
// the JS fallback incrementally.

import type {
  ItemBrowserDetail,
  ItemBrowserRow,
  ItemFacets,
  ItemSearchParams,
  MonsterDetail,
  MonsterFacets,
  MonsterSearchParams,
  MonsterSummary,
} from '@foundry-toolkit/shared/types';
import type { LootShortlistItem } from '@foundry-toolkit/ai/loot';
import { getItemFacetsIndex, getMonsterFacetsIndex } from './facets-index.js';
import type { CompendiumApi } from './index.js';
import {
  itemDocToBrowserDetail,
  itemDocToLootShortlistItem,
  itemMatchToBrowserRow,
  monsterDocToDetail,
  monsterDocToResult,
  monsterDocToRow,
  monsterMatchToSummary,
  priceToCopper,
  type MonsterResult,
  type MonsterRow,
} from './projection.js';
import type { CompendiumMatch } from './types.js';

// Default pack scope used when the user hasn't customized monster packs
// in Settings → Monsters. Every stock pf2e bestiary + NPC compendium the
// Monster Browser, loot generator, and chat-tool monster lookup should
// see. Entries absent from a given Foundry install are simply empty at
// warm time — the mcp cache skips them with a log warning, so a slimmer
// pf2e setup doesn't break anything. Adventure-path bestiaries (Kingmaker,
// Abomination Vaults, Pathfinder Society seasons, Lost Omens sourcebook
// bestiaries) aren't in this default list — GMs who want them should
// pick them from Settings → Monsters → Compendium packs (stored as
// `compendiumMonsterPackIds` in pf2e.db).
export const DEFAULT_MONSTER_PACK_IDS: readonly string[] = [
  'pf2e.pathfinder-bestiary',
  'pf2e.pathfinder-bestiary-2',
  'pf2e.pathfinder-bestiary-3',
  'pf2e.pathfinder-monster-core',
  'pf2e.pathfinder-nature-core',
  'pf2e.pathfinder-npcs',
];

// Item-pack scope stays a constant for now — the Item Browser's entire
// surface is `pf2e.equipment-srd` and tuning this hasn't been a
// reported pain point. Flip this to a resolver + setting when that
// changes.
const ITEM_PACK_IDS = ['pf2e.equipment-srd'];

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PreparedCompendium {
  // Chat tools — formatted stringy output for LLM context.
  searchMonsters(query: string): Promise<string>;
  searchItems(query: string): Promise<string>;

  // Browser / UI surface.
  listMonsters(params: MonsterSearchParams): Promise<MonsterSummary[]>;
  getMonsterFacets(): Promise<MonsterFacets>;
  getMonsterByName(name: string): Promise<MonsterDetail | null>;
  getMonsterPreview(aonUrlOrName: string): Promise<MonsterResult | null>;
  getMonsterRowByName(name: string): Promise<MonsterRow | null>;

  searchItemsBrowser(params: ItemSearchParams): Promise<ItemBrowserRow[]>;
  getItemFacets(): Promise<ItemFacets>;
  getItemBrowserDetail(id: string): Promise<ItemBrowserDetail | null>;

  // Loot generator — lean shape, keeps network cost bounded.
  buildLootShortlist(partyLevel: number): Promise<LootShortlistItem[]>;
}

export interface PreparedCompendiumOptions {
  /** Resolver called at each monster-facing query to decide which
   *  compendium packs to search. Invoked once per outer call so changes
   *  (e.g. via Settings → Monsters) take effect immediately — no
   *  cache-priming or re-init required beyond a facets-index reset.
   *  Defaults to `DEFAULT_MONSTER_PACK_IDS` when omitted. */
  resolveMonsterPackIds?: () => readonly string[];
}

export function createPreparedCompendium(api: CompendiumApi, opts?: PreparedCompendiumOptions): PreparedCompendium {
  const getMonsterPacks = opts?.resolveMonsterPackIds ?? (() => DEFAULT_MONSTER_PACK_IDS);

  return {
    searchMonsters: (q) => searchMonsters(api, getMonsterPacks(), q),
    searchItems: (q) => searchItems(api, q),

    listMonsters: (p) => listMonsters(api, getMonsterPacks(), p),
    getMonsterFacets: () => getMonsterFacetsIndex(api, { packIds: [...getMonsterPacks()] }),
    getMonsterByName: (name) => getMonsterByName(api, getMonsterPacks(), name),
    getMonsterPreview: (input) => getMonsterPreview(api, getMonsterPacks(), input),
    getMonsterRowByName: (name) => getMonsterRowByName(api, getMonsterPacks(), name),

    searchItemsBrowser: (p) => searchItemsBrowser(api, p),
    getItemFacets: () => getItemFacetsIndex(api, { packIds: ITEM_PACK_IDS }),
    getItemBrowserDetail: (id) => getItemBrowserDetail(api, id),

    buildLootShortlist: (level) => buildLootShortlist(api, level),
  };
}

// ---------------------------------------------------------------------------
// Monster accessors
// ---------------------------------------------------------------------------

function formatMonsterForChat(r: MonsterResult, idx: number): string {
  const mod = (n: number): string => (n >= 0 ? `+${n.toString()}` : `${n.toString()}`);
  return [
    `--- Creature Result ${idx.toString()}: ${r.name} (Level ${r.level.toString()}) ---`,
    `Source: ${r.source} | Rarity: ${r.rarity} | Size: ${r.size}`,
    `Traits: ${r.traits.join(', ')}`,
    `URL: ${r.aon_url}`,
    '',
    `HP ${r.hp.toString()} | AC ${r.ac.toString()} | Fort ${mod(r.fort)} | Ref ${mod(r.ref)} | Will ${mod(r.will)} | Perception ${mod(r.perception)}`,
    `Str ${mod(r.str)} Dex ${mod(r.dex)} Con ${mod(r.con)} Int ${mod(r.int)} Wis ${mod(r.wis)} Cha ${mod(r.cha)}`,
    `Speed: ${r.speed}`,
    r.immunities ? `Immunities: ${r.immunities}` : null,
    r.weaknesses ? `Weaknesses: ${r.weaknesses}` : null,
    r.resistances ? `Resistances: ${r.resistances}` : null,
    r.melee ? `Melee: ${r.melee}` : null,
    r.ranged ? `Ranged: ${r.ranged}` : null,
    r.abilities ? `\nAbilities:\n${r.abilities}` : null,
    r.description ? `\n${r.description}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join('\n');
}

async function searchMonsters(api: CompendiumApi, packIds: readonly string[], query: string): Promise<string> {
  const { matches } = await api.searchCompendium({
    q: query,
    documentType: 'npc',
    packIds: [...packIds],
    limit: 3,
  });

  if (matches.length === 0) return `[No creatures found for "${query}"]`;

  const results: MonsterResult[] = [];
  for (const m of matches) {
    try {
      const { document } = await api.getCompendiumDocument(m.uuid);
      results.push(monsterDocToResult(document));
    } catch {
      // Skip a single failed doc fetch rather than abort the whole search.
    }
  }

  if (results.length === 0) return `[No creatures found for "${query}"]`;
  return results.map((r, i) => formatMonsterForChat(r, i + 1)).join('\n\n');
}

async function listMonsters(
  api: CompendiumApi,
  packIds: readonly string[],
  params: MonsterSearchParams,
): Promise<MonsterSummary[]> {
  // DIAGNOSTIC MODE — no filters at all, not even documentType. The
  // Monster window returns every document from every ticked pack. If a
  // tick selection includes an Item-type pack the user will see items
  // in the browser; that's intentional while we verify the pack-select
  // pipeline end-to-end. Sort is not a filter and stays applied.
  //
  // Search args sent:
  //   - packIds: resolver output (Settings ∩ installed in Foundry)
  //   - limit  : 10000 (server max)
  // Nothing else — not q, traits, maxLevel, documentType.
  const search = {
    packIds: [...packIds],
    limit: params.limit ?? 10000,
  };
  console.info('[listMonsters] searchCompendium ←', {
    packCount: search.packIds.length,
    packIds: search.packIds,
    limit: search.limit,
  });
  const { matches } = await api.searchCompendium(search);
  console.info('[listMonsters] searchCompendium → matches:', matches.length);

  const summaries = matches.map(monsterMatchToSummary);

  const sortBy = params.sortBy ?? 'level';
  const sortDir = params.sortDir ?? 'asc';
  if (sortBy === 'name' || sortBy === 'level') {
    summaries.sort((a, b) => {
      const av = sortBy === 'name' ? a.name : a.level;
      const bv = sortBy === 'name' ? b.name : b.level;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      const diff = (av as number) - (bv as number);
      return sortDir === 'desc' ? -diff : diff;
    });
  }

  return summaries;
}

async function fetchMonsterDocByName<T>(
  api: CompendiumApi,
  packIds: readonly string[],
  name: string,
  map: (d: import('./types.js').CompendiumDocument) => T,
): Promise<T | null> {
  const { matches } = await api.searchCompendium({
    q: name,
    documentType: 'npc',
    packIds: [...packIds],
    limit: 5,
  });
  // Prefer an exact case-insensitive name match over the top fuzzy hit;
  // the legacy DB path keyed on exact equality.
  const exact = matches.find((m) => m.name.toLowerCase() === name.toLowerCase());
  const pick = exact ?? matches[0];
  if (!pick) return null;
  const { document } = await api.getCompendiumDocument(pick.uuid);
  return map(document);
}

function getMonsterByName(api: CompendiumApi, packIds: readonly string[], name: string): Promise<MonsterDetail | null> {
  return fetchMonsterDocByName(api, packIds, name, monsterDocToDetail);
}

function getMonsterRowByName(api: CompendiumApi, packIds: readonly string[], name: string): Promise<MonsterRow | null> {
  return fetchMonsterDocByName(api, packIds, name, monsterDocToRow);
}

/** Hover preview. The legacy implementation keyed on an AoN URL; the
 *  projection layer drops AoN enrichment, so we treat the input as a
 *  creature name. If the caller accidentally passes a URL we strip it
 *  back to a sensible name (last path segment, spaces restored). */
function getMonsterPreview(
  api: CompendiumApi,
  packIds: readonly string[],
  input: string,
): Promise<MonsterResult | null> {
  let name = input;
  if (input.includes('://') || input.startsWith('/')) {
    const trailing = input.replace(/\/$/, '').split('/').pop() ?? '';
    name = decodeURIComponent(trailing).replace(/[-_]/g, ' ');
  }
  return fetchMonsterDocByName(api, packIds, name, monsterDocToResult);
}

// ---------------------------------------------------------------------------
// Item accessors
// ---------------------------------------------------------------------------

async function searchItems(api: CompendiumApi, query: string): Promise<string> {
  const { matches } = await api.searchCompendium({
    q: query,
    documentType: 'Item',
    packIds: ITEM_PACK_IDS,
    limit: 3,
  });
  if (matches.length === 0) return `[No items found for "${query}"]`;

  const lines: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    try {
      const { document } = await api.getCompendiumDocument(m.uuid);
      const detail = itemDocToBrowserDetail(document);
      const desc = detail.description;
      const truncated = desc.length > 1000 ? desc.slice(0, 1000) + '…' : desc;
      lines.push(
        [
          `--- Item Result ${(i + 1).toString()}: ${detail.name} (Level ${(detail.level ?? 0).toString()}) ---`,
          `Source: ${detail.source ?? '—'}`,
          `Price: ${detail.price ?? '—'} | Bulk: ${detail.bulk ?? '—'} | Usage: ${detail.usage ?? '—'}`,
          `Traits: ${detail.traits.length > 0 ? detail.traits.join(', ') : '—'}`,
          `URL: ${detail.aonUrl ?? ''}`,
          '',
          truncated,
        ].join('\n'),
      );
    } catch {
      // Skip a failed doc fetch rather than abort.
    }
  }
  if (lines.length === 0) return `[No items found for "${query}"]`;
  return lines.join('\n\n');
}

function filterItemMatchesClientSide(matches: CompendiumMatch[], params: ItemSearchParams): CompendiumMatch[] {
  return matches.filter((m) => {
    if (params.levelMin != null) {
      if (typeof m.level !== 'number' || m.level < params.levelMin) return false;
    }
    if (params.levelMax != null) {
      if (typeof m.level !== 'number' || m.level > params.levelMax) return false;
    }
    if (params.rarities && params.rarities.length > 0) {
      const traits = m.traits ?? [];
      const rarity = (() => {
        for (const t of traits) {
          const up = t.toUpperCase();
          if (up === 'UNCOMMON' || up === 'RARE' || up === 'UNIQUE') return up;
        }
        return 'COMMON';
      })();
      const allowed = params.rarities.map((r) => r.toUpperCase());
      if (!allowed.includes(rarity)) return false;
    }
    if (params.traits && params.traits.length > 0) {
      const mTraits = m.traits ?? [];
      for (const t of params.traits) {
        if (!mTraits.includes(t)) return false;
      }
    }
    return true;
  });
}

async function searchItemsBrowser(api: CompendiumApi, params: ItemSearchParams): Promise<ItemBrowserRow[]> {
  const { matches } = await api.searchCompendium({
    q: params.keywords,
    documentType: 'Item',
    packIds: ITEM_PACK_IDS,
    traits: params.traits,
    maxLevel: params.levelMax,
    limit: params.limit ?? 500,
  });

  const filtered = filterItemMatchesClientSide(matches, params);
  const rows = filtered.map(itemMatchToBrowserRow);

  const sortBy = params.sortBy ?? 'name';
  const sortDir = params.sortDir ?? 'asc';
  rows.sort((a, b) => {
    if (sortBy === 'price') {
      const diff = priceToCopper(a.price) - priceToCopper(b.price);
      return sortDir === 'desc' ? -diff : diff;
    }
    if (sortBy === 'level') {
      const diff = (a.level ?? 0) - (b.level ?? 0);
      if (diff !== 0) return sortDir === 'desc' ? -diff : diff;
      return a.name.localeCompare(b.name);
    }
    return sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
  });

  return rows;
}

async function getItemBrowserDetail(api: CompendiumApi, id: string): Promise<ItemBrowserDetail | null> {
  const uuid = `Compendium.pf2e.equipment-srd.Item.${id}`;
  try {
    const { document } = await api.getCompendiumDocument(uuid);
    return itemDocToBrowserDetail(document);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Loot shortlist
// ---------------------------------------------------------------------------

async function buildLootShortlist(api: CompendiumApi, partyLevel: number): Promise<LootShortlistItem[]> {
  const levelMax = partyLevel + 2;
  const { matches } = await api.searchCompendium({
    documentType: 'Item',
    packIds: ITEM_PACK_IDS,
    maxLevel: levelMax,
    limit: 5000,
  });

  // Client-side minLevel filter — the wire contract only exposes maxLevel
  // today. We also re-enforce levelMax here so a server that drops the
  // maxLevel filter (e.g. because a feature-flag is off) doesn't hand
  // back a roster of on-level-20 party-obliterating loot.
  const levelMin = Math.max(0, partyLevel - 2);
  const inRange = matches.filter((m) => typeof m.level === 'number' && m.level >= levelMin && m.level <= levelMax);

  // Fisher-Yates sample of 80. Doing a partial shuffle is cheaper than
  // sorting by random() when the population is large.
  const pool = inRange.slice();
  const sampleSize = Math.min(80, pool.length);
  for (let i = 0; i < sampleSize; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const sampled = pool.slice(0, sampleSize);

  // Map to the LootShortlistItem shape. We use the match-row projection
  // where we can, and fall back to a lean synthesised shape for the
  // bulk / usage / source fields the match doesn't carry. Consumers that
  // need full fidelity can pull the full doc; the loot agent does not.
  return sampled.map((m) => matchToLootShortlistItem(m));
}

function matchToLootShortlistItem(m: CompendiumMatch): LootShortlistItem {
  const traits = m.traits ?? [];
  return {
    id: m.documentId,
    name: m.name,
    level: m.level ?? null,
    price: m.price
      ? (() => {
          // Inline the structured-price → string formatter so this module
          // stays import-light. Same logic as
          // projection.ts:formatPriceStructured.
          const parts: string[] = [];
          const { pp, gp, sp, cp } = m.price.value;
          if (typeof pp === 'number' && pp > 0) parts.push(`${pp.toString()} pp`);
          if (typeof gp === 'number' && gp > 0) parts.push(`${gp.toString()} gp`);
          if (typeof sp === 'number' && sp > 0) parts.push(`${sp.toString()} sp`);
          if (typeof cp === 'number' && cp > 0) parts.push(`${cp.toString()} cp`);
          return parts.length > 0 ? parts.join(', ') : null;
        })()
      : null,
    bulk: null,
    traits: traits.join(','),
    usage: null,
    aonUrl: null,
    isMagical: traits.includes('magical') || traits.includes('invested') ? 1 : 0,
    source: null,
  };
}

// Exported for tests that want to exercise the projection without
// reinstantiating the factory.
export { itemDocToLootShortlistItem };
