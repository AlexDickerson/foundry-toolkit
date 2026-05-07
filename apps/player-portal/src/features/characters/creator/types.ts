// Shared types for the character-creator wizard.
//
// Sits at the bottom of the local module graph so any sibling can
// import freely without cycles. Step components, helpers, and the
// `CharacterCreator` root all consume these.

import type { AbilityKey, CompendiumMatch, CompendiumSearchOptions } from '@/features/characters/types';

export type Step = 'identity' | 'ancestry' | 'class' | 'background' | 'attributes' | 'skills' | 'languages' | 'review';

// Picker targets are decoupled from wizard steps: heritage selection
// lives inside the ancestry step rather than owning a step of its own
// (heritages are always children of an ancestry in pf2e's data), and
// deity selection lives inside the identity step.
export type PickerTarget = 'ancestry' | 'heritage' | 'class' | 'background' | 'deity' | 'class-feat' | 'ancestry-feat';

export interface Slot {
  match: CompendiumMatch;
  // Item id on the persisted actor. Saved so we can delete the old
  // item when the user changes their pick for this slot.
  itemId: string;
}

export interface Draft {
  name: string;
  // Free-text identity fields. pf2e stores these on `system.details`;
  // we flush them to the actor when the user advances off the
  // identity step (not per-keystroke).
  gender: string;
  age: string;
  ethnicity: string;
  nationality: string;
  deity: Slot | null;
  ancestry: Slot | null;
  // Ancestry slug (e.g. 'elf', 'merfolk') fetched once after the
  // ancestry is picked — heritage filtering needs it. Stored
  // separately so an ancestry change can clear it while the refetch
  // is in-flight.
  ancestrySlug: string | null;
  heritage: Slot | null;
  // Heritage slug, fetched like ancestrySlug. Used so the ancestry-
  // feat picker can surface versatile-heritage feats (changeling,
  // aiuvarin, nephilim …) whose compendium items are tagged with the
  // heritage slug rather than the parent ancestry's slug.
  heritageSlug: string | null;
  class: Slot | null;
  // Class slug mirrors ancestrySlug — fetched from the class doc after
  // a class is picked so the class-feat picker can scope to that
  // trait. pf2e tags class feats with the class's slug as a trait
  // (e.g. ['alchemist']).
  classSlug: string | null;
  background: Slot | null;
  // Level-1 class and ancestry feat slots. Each is a regular picked
  // item on the actor (same Slot shape as the other picks) — the
  // creator just knows which pack/trait scope to search in.
  classFeat: Slot | null;
  ancestryFeat: Slot | null;
  // Level-1 free boosts (four distinct abilities). Stored locally
  // until the attributes step flushes them to
  // `system.build.attributes.boosts.1` on the actor.
  levelOneBoosts: AbilityKey[];
  // User-selected skill trainings beyond the fixed ones baked into
  // the ancestry/background/class items. pf2e applies everything in
  // `class.system.trainedSkills.value` as rank-1 trainings, so the
  // skills step appends these to that array (on top of what the
  // class item ships with).
  skillPicks: string[];
  // Additional languages the user picked on top of the ancestry's
  // fixed languages. Flushed into `actor.system.details.languages.value`
  // merged with the granted list.
  languagePicks: string[];
  // Ambient state surfaced by the step components so the Review
  // section can distinguish "user hasn't picked yet" from "no pick
  // was ever available" (Wizard doesn't grant an L1 class feat;
  // Anadi with Int 0 has no free language picks).
  classGrantsL1Feat: boolean | null;
  languageAllowance: number | null;
  // Per-source boost picks. Each array mirrors the item's boost
  // slots in order; fixed slots carry the pre-determined ability,
  // choice/free slots start null until the user selects. Flushed to
  // `system.build.attributes.boosts.{source}` on change.
  ancestryBoosts: (AbilityKey | null)[];
  backgroundBoosts: (AbilityKey | null)[];
  classKeyAbility: AbilityKey | null;
}

// Actor lifecycle: wizard opens → creating → ready (actor exists in
// Foundry, piecemeal patches flow through). Failed creation blocks
// the UI with a retry button.
export type CreatorState =
  | { kind: 'creating' }
  | { kind: 'ready'; actorId: string }
  | { kind: 'error'; message: string };

export type PickerFilters = Pick<
  CompendiumSearchOptions,
  'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'ancestrySlug' | 'maxLevel'
>;
