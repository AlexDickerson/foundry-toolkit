import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

import type { AbilityKey } from './primitives';

export type SpellPreparationMode = 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'ritual' | 'items';
export type SpellTradition = 'arcane' | 'divine' | 'occult' | 'primal';

export interface SpellcastingEntrySlot {
  max: number;
  value?: number;
  prepared?: Array<{ id: string | null; expended?: boolean }>;
}

export interface SpellcastingEntryItemSystem {
  slug: string | null;
  prepared: { value: SpellPreparationMode; flexible?: boolean };
  tradition: { value: SpellTradition | '' };
  ability?: { value: AbilityKey };
  slots?: Record<string, SpellcastingEntrySlot>;
  proficiency?: { value: number };
  [key: string]: unknown;
}

export interface SpellcastingEntryItem {
  id: string;
  name: string;
  type: 'spellcastingEntry';
  img: string;
  system: SpellcastingEntryItemSystem;
}

export function isSpellcastingEntryItem(item: PreparedActorItem): item is SpellcastingEntryItem {
  return item.type === 'spellcastingEntry';
}

export interface SpellHeightening {
  // 'interval': each +N steps above base rank applies `damage` / `area` /
  // etc. once more. 'fixed': explicit per-rank overrides in `levels`.
  type?: 'interval' | 'fixed';
  interval?: number;
  // Keyed by partition id; values are dice expressions ("2d6") applied
  // per step. pf2e sometimes emits entries for non-damage scalars
  // alongside real dice — the reader filters those out.
  damage?: Record<string, string>;
  levels?: Record<string, unknown>;
}

export interface SpellItemSystem {
  slug: string | null;
  // Base rank of the spell. Cantrips also carry the `cantrip` trait —
  // use that, not `level.value`, to tell cantrips apart from rank-1
  // spells (cantrips heighten automatically at cast time).
  level: { value: number };
  traits: { value: string[]; rarity: string; traditions?: string[] };
  description?: { value: string };
  // Back-reference to the owning spellcastingEntry by id. May be absent
  // or dangling on orphaned imports.
  location?: { value: string | null; heightenedLevel?: number | null };
  // Action cost string. pf2e uses "1"/"2"/"3" for 1/2/3-action casts,
  // "reaction"/"free" for those, and free-form like "1 minute" or
  // "10 minutes" for longer castings.
  time?: { value: string };
  range?: { value: string };
  area?: { type?: string; value?: number | string } | null;
  target?: { value: string };
  heightening?: SpellHeightening;
  [key: string]: unknown;
}

export interface SpellItem {
  id: string;
  name: string;
  type: 'spell';
  img: string;
  system: SpellItemSystem;
}

export function isSpellItem(item: PreparedActorItem): item is SpellItem {
  return item.type === 'spell';
}

export function isCantripSpell(spell: SpellItem): boolean {
  const traits = spell.system.traits.value;
  return traits.includes('cantrip');
}
