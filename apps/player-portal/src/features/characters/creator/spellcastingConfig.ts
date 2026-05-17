// Lookup table: class slug → spellcasting entry configuration.
//
// PF2e does not automatically create spellcastingEntry embedded items when a
// class item is dropped via our api-bridge surface (class feature rule elements
// have empty rules arrays for spellcasting features). This table drives explicit
// entry creation in the character creator.
//
// Coverage for this PR:
//   Fixed-tradition casters → entry created at class-pick time
//   Sorcerer → entry created at finish time using bloodline lookup below
//   Witch, Summoner, Animist → deferred (patron/eidolon determines tradition;
//     requires additional ChoiceSet resolution before tradition is known)

import type { AbilityKey } from '@/features/characters/types';
import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

export type SpellTradition = 'arcane' | 'divine' | 'occult' | 'primal';
export type PreparedMode = 'prepared' | 'spontaneous' | 'focus' | 'innate';

export interface SpellcastingEntryConfig {
  tradition: SpellTradition;
  prepared: PreparedMode;
  ability: AbilityKey;
}

// Classes with a fixed tradition that don't depend on subclass selection.
// Key ability matches the PF2e class key attribute.
const FIXED_CLASS_CONFIGS: Record<string, SpellcastingEntryConfig> = {
  wizard: { tradition: 'arcane', prepared: 'prepared', ability: 'int' },
  magus: { tradition: 'arcane', prepared: 'prepared', ability: 'int' },
  psychic: { tradition: 'occult', prepared: 'spontaneous', ability: 'int' },
  cleric: { tradition: 'divine', prepared: 'prepared', ability: 'wis' },
  druid: { tradition: 'primal', prepared: 'prepared', ability: 'wis' },
  bard: { tradition: 'occult', prepared: 'spontaneous', ability: 'cha' },
  oracle: { tradition: 'divine', prepared: 'spontaneous', ability: 'cha' },
};

// Sorcerer bloodline slug → tradition.
// Source: each bloodline's system.rules RollOption "feature:bloodline:tradition:<tradition>".
// Slugs follow pf2e convention: "bloodline-<name>".
const SORCERER_BLOODLINE_TRADITIONS: Record<string, SpellTradition> = {
  'bloodline-aberrant': 'occult',
  'bloodline-angelic': 'divine',
  'bloodline-demonic': 'divine',
  'bloodline-diabolic': 'divine',
  'bloodline-draconic': 'arcane',
  'bloodline-elemental': 'primal',
  'bloodline-fey': 'primal',
  'bloodline-genie': 'primal',
  'bloodline-hag': 'occult',
  'bloodline-harrow': 'occult',
  'bloodline-imperial': 'arcane',
  'bloodline-nymph': 'primal',
  'bloodline-phoenix': 'primal',
  'bloodline-psychopomp': 'occult',
  'bloodline-shadow': 'occult',
  'bloodline-undead': 'divine',
  'bloodline-wyrmblessed': 'arcane',
};

// Returns the spellcasting entry configuration for a class, or null if:
//   - the class has no spellcasting entry at level 1 (martial, kineticist, etc.)
//   - the tradition requires a subclass choice not yet provided (sorcerer without bloodlineSlug)
export function spellcastingConfigFor(
  classSlug: string,
  bloodlineSlug?: string,
): SpellcastingEntryConfig | null {
  if (classSlug === 'sorcerer') {
    if (bloodlineSlug === undefined) return null;
    const tradition = SORCERER_BLOODLINE_TRADITIONS[bloodlineSlug];
    return tradition !== undefined ? { tradition, prepared: 'spontaneous', ability: 'cha' } : null;
  }
  return FIXED_CLASS_CONFIGS[classSlug] ?? null;
}

// Scans actor items for a Sorcerer bloodline classfeature and returns its slug.
// Bloodline items have system.slug matching the SORCERER_BLOODLINE_TRADITIONS keys.
export function sorcererBloodlineSlugFromItems(items: PreparedActorItem[]): string | undefined {
  for (const item of items) {
    if (item.type !== 'feat') continue;
    const sys = item.system;
    if (sys['category'] !== 'classfeature') continue;
    const slug = typeof sys['slug'] === 'string' ? sys['slug'] : null;
    if (slug !== null && slug in SORCERER_BLOODLINE_TRADITIONS) return slug;
  }
  return undefined;
}
