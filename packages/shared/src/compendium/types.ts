// ---------------------------------------------------------------------------
// Item browser
// ---------------------------------------------------------------------------

export type ItemSortField = 'name' | 'level' | 'price';
export type SortDirection = 'asc' | 'desc';

export interface ItemSearchParams {
  keywords?: string;
  levelMin?: number;
  levelMax?: number;
  rarities?: string[];
  isMagical?: boolean | null;
  usageCategories?: string[];
  traits?: string[];
  sources?: string[];
  sortBy?: ItemSortField;
  sortDir?: SortDirection;
  limit?: number;
}

/** Lightweight row for the item table — no description to keep IPC payloads
 *  small when returning hundreds of results. */
export interface ItemBrowserRow {
  id: string;
  name: string;
  level: number | null;
  traits: string[];
  rarity: string;
  price: string | null;
  bulk: string | null;
  usage: string | null;
  isMagical: boolean;
  hasVariants: boolean;
  /** true = ORC/remastered, false = OGL/legacy, null = unknown. */
  isRemastered: boolean | null;
  /** Renderer-ready URL for the item's Foundry icon (already routed through
   *  the asset proxy or monster-file:// protocol by the IPC layer). Null
   *  when the icon is missing or is a default-icon placeholder. */
  img?: string | null;
}

export interface ItemVariant {
  type: string;
  level: number | null;
  price: string | null;
}

/** Full item detail including description and parsed variants. */
export interface ItemBrowserDetail extends ItemBrowserRow {
  description: string;
  source: string | null;
  aonUrl: string | null;
  variants: ItemVariant[];
  hasActivation: boolean;
  /** Foundry document type slug: "weapon" | "armor" | "consumable" | "equipment" | "shield" | etc. */
  itemType: string;
}

/** Distinct filter values for the item filter panel. */
export interface ItemFacets {
  traits: string[];
  sources: string[];
  usageCategories: string[];
}

/** Renderer-facing compendium pack descriptor. Mirrors the subset of
 *  foundry-mcp's `CompendiumPack` that the Settings → Monsters dialog
 *  needs — enough to render each pack as a labeled checkbox. */
export interface CompendiumPackSummary {
  /** Foundry pack id, e.g. `pf2e.pathfinder-bestiary`. Canonical key
   *  for the monster-pack override setting. */
  id: string;
  /** Human-readable label from Foundry's pack metadata, e.g. "Pathfinder
   *  Bestiary". Shown as the checkbox label. */
  label: string;
  /** 'Actor' for bestiaries/NPCs, 'Item' for equipment/feats/etc. */
  type: string;
  /** Game system name. Usually `'pf2e'` for the packs this dialog lists. */
  system?: string;
}

// ---------------------------------------------------------------------------
// Monster browser
// ---------------------------------------------------------------------------

export interface MonsterSearchParams {
  keywords?: string;
  levels?: [number, number];
  rarities?: string[];
  sizes?: string[];
  creatureTypes?: string[];
  traits?: string[];
  sources?: string[];
  hpMin?: number;
  hpMax?: number;
  acMin?: number;
  acMax?: number;
  fortMin?: number;
  refMin?: number;
  willMin?: number;
  sortBy?: 'name' | 'level' | 'hp' | 'ac';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface MonsterSummary {
  name: string;
  level: number;
  hp: number;
  ac: number;
  fort: number;
  ref: number;
  will: number;
  rarity: string;
  size: string;
  creatureType: string;
  traits: string[];
  source: string;
  aonUrl: string;
}

export interface MonsterSpellInfo {
  name: string;
  /** 0 = cantrip, 1–10 = spell rank */
  rank: number;
  /** For innate spells — undefined means unlimited/at-will */
  usesPerDay?: number;
  /** PF2e action cost: "1", "2", "3", "reaction", "free", or empty */
  castTime: string;
  range: string;
  area: string;
  target: string;
  traits: string[];
  /** Cleaned plain-text description (Foundry markup stripped) */
  description: string;
}

export interface MonsterSpellRank {
  rank: number;
  spells: MonsterSpellInfo[];
}

export interface MonsterSpellGroup {
  entryName: string;
  tradition: string;
  castingType: string;
  dc?: number;
  attack?: number;
  ranks: MonsterSpellRank[];
}

export interface MonsterDetail {
  name: string;
  level: number;
  source: string;
  rarity: string;
  size: string;
  traits: string[];
  hp: number;
  ac: number;
  fort: number;
  ref: number;
  will: number;
  perception: number;
  skills: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  speed: string;
  immunities: string;
  weaknesses: string;
  resistances: string;
  melee: string;
  ranged: string;
  abilities: string;
  /** Structured spell groups. Empty array when the monster has no spells. */
  spells: MonsterSpellGroup[];
  description: string;
  aonUrl: string;
  /** Relative path to portrait art image, or null if unavailable. */
  imageUrl: string | null;
  /** Relative path to token image, or null if unavailable. */
  tokenUrl: string | null;
}

export interface MonsterFacets {
  rarities: string[];
  sizes: string[];
  creatureTypes: string[];
  traits: string[];
  sources: string[];
  levelRange: [number, number];
}
