import type { ClassFeatureEntry, ClassItem } from '@/features/characters/types';

/**
 * The set of progression slots a character can fill at a given level.
 * Mirrors the pf2e level-up taxonomy plus ability boosts (which the system
 * doesn't encode per-level on the class item, hence the explicit list below).
 */
export type SlotType =
  | 'class-feat'
  | 'ancestry-feat'
  | 'skill-feat'
  | 'general-feat'
  | 'skill-increase'
  | 'ability-boosts';

/** Composite key encoding both the level and the slot kind. */
export type SlotKey = string;

/**
 * Levels at which every pf2e character takes 4 ability boosts. Not on the
 * class item — see PF2e Core Rulebook "Advancing Your Character" (p.32).
 */
export const ABILITY_BOOST_LEVELS: readonly number[] = [5, 10, 15, 20];

/**
 * Build the composite slot key. One level can open several slot types
 * (e.g. class feat + skill feat at L2), so the picks map keys on
 * `${level}:${slot}` rather than just level.
 */
export function slotKey(level: number, slot: SlotType): SlotKey {
  return `${level.toString()}:${slot}`;
}

/**
 * Reverse of {@link slotKey}. Returns null for keys that don't fit the shape;
 * the slot string is cast directly without revalidation, on the assumption
 * that every persisted key originated from `slotKey(_, slotType)`.
 */
export function parseSlotKey(key: SlotKey): { level: number; slot: SlotType } | null {
  const sep = key.indexOf(':');
  if (sep === -1) return null;
  const level = Number(key.slice(0, sep));
  if (!Number.isFinite(level)) return null;
  return { level, slot: key.slice(sep + 1) as SlotType };
}

/**
 * Map a feat-slot type to the pf2e `<category>-<level>` location string
 * written into `feat.system.location` for "Add to Slot"-style picks.
 * Returns null for slots that don't carry a location tag (skill increase,
 * ability boosts).
 */
const FEAT_SLOT_LOCATION_PREFIX: Partial<Record<SlotType, string>> = {
  'class-feat': 'class',
  'ancestry-feat': 'ancestry',
  'skill-feat': 'skill',
  'general-feat': 'general',
};

export function featSlotLocationFor(slot: SlotType, level: number): string | null {
  const prefix = FEAT_SLOT_LOCATION_PREFIX[slot];
  return prefix !== undefined ? `${prefix}-${level.toString()}` : null;
}

/**
 * Reverse of {@link featSlotLocationFor}. Used to hydrate the picks map
 * from feat items the actor already owns. Returns null for any pf2e
 * location that doesn't fit the four core categories — archetype-N etc.
 * are deliberately left unhandled because they don't fit the level chassis.
 */
export function parseFeatLocation(location: string): { slot: SlotType; level: number } | null {
  const match = /^(ancestry|class|skill|general)-(\d+)$/.exec(location);
  if (!match) return null;
  const level = Number(match[2]);
  if (!Number.isFinite(level) || level < 1) return null;
  const prefix = match[1] as 'ancestry' | 'class' | 'skill' | 'general';
  return { slot: `${prefix}-feat`, level };
}

/**
 * For each level 1-20, the ordered list of slot types the character opens
 * at that level. Order is render-order: class feats first (most
 * character-defining), ability boosts last (collapsed into a single chip).
 */
export function buildLevelSlotMap(sys: ClassItem['system']): Map<number, readonly SlotType[]> {
  const rules: Array<[SlotType, readonly number[]]> = [
    ['class-feat', sys.classFeatLevels.value],
    ['ancestry-feat', sys.ancestryFeatLevels.value],
    ['skill-feat', sys.skillFeatLevels.value],
    ['general-feat', sys.generalFeatLevels.value],
    ['skill-increase', sys.skillIncreaseLevels.value],
    ['ability-boosts', ABILITY_BOOST_LEVELS],
  ];
  const out = new Map<number, SlotType[]>();
  for (const [slot, levels] of rules) {
    for (const level of levels) {
      const arr = out.get(level) ?? [];
      arr.push(slot);
      out.set(level, arr);
    }
  }
  return out;
}

/**
 * Group the class item's auto-granted features by their grant level,
 * sorted alphabetically within each level. Used to render the timeline rows.
 */
export function groupFeaturesByLevel(
  items: ClassItem['system']['items'],
): Map<number, ClassFeatureEntry[]> {
  const out = new Map<number, ClassFeatureEntry[]>();
  for (const entry of Object.values(items)) {
    const arr = out.get(entry.level) ?? [];
    arr.push(entry);
    out.set(entry.level, arr);
  }
  for (const [, arr] of out) arr.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
