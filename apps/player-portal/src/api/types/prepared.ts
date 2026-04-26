import type { PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

import type { CharacterSystem } from './character';

export interface PreparedCharacter {
  id: string;
  uuid: string;
  name: string;
  type: 'character';
  img: string;
  system: CharacterSystem;
  items: PreparedActorItem[];
  /** Mirrors the shared `PreparedActor.flags` field. character-creator
   *  persists sheet-level preferences (e.g. background image path)
   *  under the `character-creator` scope. */
  flags?: Record<string, Record<string, unknown>>;
}
