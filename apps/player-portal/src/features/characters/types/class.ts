import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

import type { AbilityKey } from './primitives';

// pf2e's class item embeds the entire level-by-level feature progression
// and the level arrays for each feat/skill slot. `system.items` is an
// object map keyed by opaque short ids; entries describe the features
// auto-granted at their `level`. The feat-level arrays list which levels
// open a given slot type.
export interface ClassFeatureEntry {
  uuid: string;
  name: string;
  img: string;
  level: number;
}

export interface ClassItemSystem {
  slug: string | null;
  description?: { value: string };
  items: Record<string, ClassFeatureEntry>;
  keyAbility: { value: AbilityKey[] };
  hp: number;
  ancestryFeatLevels: { value: number[] };
  classFeatLevels: { value: number[] };
  generalFeatLevels: { value: number[] };
  skillFeatLevels: { value: number[] };
  skillIncreaseLevels: { value: number[] };
  [key: string]: unknown;
}

export interface ClassItem {
  id: string;
  name: string;
  type: 'class';
  img: string;
  system: ClassItemSystem;
}

export function isClassItem(item: PreparedActorItem): item is ClassItem {
  return item.type === 'class';
}
