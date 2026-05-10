import { api } from '@/features/characters/api';
import type { CompendiumMatch } from '@/features/characters/types';
import { BOOSTS_REQUIRED, STATIC_PICKER_FILTERS } from './constants';
import type { Draft, PickerFilters, PickerTarget, Slot, Step } from './types';

// Module-scoped so React 18 StrictMode's dev-only double-mount
// doesn't spawn two actor-create requests. First mount creates the
// promise, second mount reuses it. Reset to null when the user
// actually leaves the wizard (back or finish), so the next session
// allocates a fresh draft actor.
let pendingActorPromise: Promise<string> | null = null;

export function beginOrReusePendingActor(): Promise<string> {
  if (pendingActorPromise === null) {
    pendingActorPromise = api
      .createActor({ name: 'New Character', type: 'character' })
      .then((ref) => ref.id)
      .catch((err: unknown) => {
        // Clear so the next attempt retries fresh instead of getting
        // stuck replaying the rejection.
        pendingActorPromise = null;
        throw err;
      });
  }
  return pendingActorPromise;
}

export function resetPendingActor(): void {
  pendingActorPromise = null;
}

export function filtersForTarget(target: PickerTarget, draft: Draft): PickerFilters {
  if (target === 'heritage') {
    const base: PickerFilters = { packIds: ['pf2e.heritages'], documentType: 'Item' };
    if (draft.ancestrySlug !== null) base.ancestrySlug = draft.ancestrySlug;
    return base;
  }
  if (target === 'class-feat') {
    // pf2e tags class feats with the class's slug as a trait —
    // 'alchemist', 'fighter', 'wizard' etc. Cap to level 1 so the
    // picker only shows L1-qualifying feats.
    const traits = draft.classSlug !== null ? [draft.classSlug] : undefined;
    const base: PickerFilters = { packIds: ['pf2e.feats-srd'], documentType: 'Item', maxLevel: 1 };
    if (traits) base.traits = traits;
    return base;
  }
  if (target === 'ancestry-feat') {
    // Pool the ancestry slug + heritage slug (when different) so the
    // picker surfaces versatile-heritage feats (changeling, aiuvarin,
    // nephilim …) alongside the parent ancestry's feats. When only
    // the ancestry slug is known, fall back to a simple `traits`
    // filter.
    const base: PickerFilters = { packIds: ['pf2e.feats-srd'], documentType: 'Item', maxLevel: 1 };
    const slugs: string[] = [];
    if (draft.ancestrySlug !== null) slugs.push(draft.ancestrySlug);
    if (draft.heritageSlug !== null && !slugs.includes(draft.heritageSlug)) slugs.push(draft.heritageSlug);
    if (slugs.length > 1) {
      base.anyTraits = slugs;
    } else if (slugs.length === 1) {
      base.traits = slugs;
    }
    return base;
  }
  return STATIC_PICKER_FILTERS[target];
}

export function isStepFilled(step: Step, draft: Draft): boolean {
  switch (step) {
    case 'identity':
      return draft.name.trim().length > 0;
    case 'ancestry':
      return draft.ancestry !== null && draft.heritage !== null;
    case 'class':
      return draft.class !== null;
    case 'background':
      return draft.background !== null;
    case 'attributes':
      return (
        draft.levelOneBoosts.length === BOOSTS_REQUIRED &&
        draft.ancestryBoosts.every((v) => v !== null) &&
        draft.backgroundBoosts.every((v) => v !== null) &&
        draft.classKeyAbility !== null
      );
    case 'skills':
      return draft.skillPicks.length > 0;
    case 'languages':
      return draft.languagePicks.length > 0;
    case 'review':
      return false;
  }
}

// Feat-slot location strings mirror pf2e's own convention
// (`<category>-<level>`). Only L1 feats at creation for now.
function featLocationFor(target: PickerTarget): string | null {
  if (target === 'class-feat') return 'class-1';
  if (target === 'ancestry-feat') return 'ancestry-1';
  return null;
}

function previousItemIdFor(draft: Draft, target: PickerTarget): string | null {
  switch (target) {
    case 'ancestry':
      return draft.ancestry?.itemId ?? null;
    case 'heritage':
      return draft.heritage?.itemId ?? null;
    case 'class':
      return draft.class?.itemId ?? null;
    case 'background':
      return draft.background?.itemId ?? null;
    case 'deity':
      return draft.deity?.itemId ?? null;
    case 'class-feat':
      return draft.classFeat?.itemId ?? null;
    case 'ancestry-feat':
      return draft.ancestryFeat?.itemId ?? null;
  }
}

// Add the newly-picked compendium item to the actor, then delete the
// previous pick for this slot (if any). Returns the new Slot for the
// caller to commit into the draft. Order matters: add first so a
// transient network failure doesn't leave the actor with zero items
// for the slot.
export async function persistPick(
  actorId: string,
  target: PickerTarget,
  match: CompendiumMatch,
  draft: Draft,
): Promise<Slot> {
  // L1 feats need a `system.location` slot tag so pf2e and the
  // Progression tab recognise them as filling the slot. Non-feat
  // picks don't need this — pf2e matches those via their category.
  const location = featLocationFor(target);
  const created = await api.addItemFromCompendium(actorId, {
    packId: match.packId,
    itemId: match.documentId,
    ...(location !== null ? { systemOverrides: { location } } : {}),
  });
  const previousId = previousItemIdFor(draft, target);
  if (previousId !== null) {
    // Best-effort cleanup — if the old item vanished externally the
    // delete returns 404 and that's fine for the user's state.
    await api.deleteActorItem(actorId, previousId).catch(() => {
      /* ignore */
    });
  }
  // Heritage + ancestry feat get auto-discarded when ancestry changes —
  // also clean up the old embedded items so the actor doesn't wear
  // a dwarf heritage or an ancestry feat from the previous pick.
  if (target === 'ancestry') {
    const orphans = [draft.heritage?.itemId, draft.ancestryFeat?.itemId].filter(
      (id): id is string => typeof id === 'string',
    );
    for (const id of orphans) {
      await api.deleteActorItem(actorId, id).catch(() => {
        /* ignore */
      });
    }
  }
  if (target === 'class' && draft.classFeat !== null) {
    // Same rationale for class feat when the class changes.
    await api.deleteActorItem(actorId, draft.classFeat.itemId).catch(() => {
      /* ignore */
    });
  }
  return { match, itemId: created.id };
}

export function applyPickedSlot(draft: Draft, target: PickerTarget, slot: Slot): Draft {
  switch (target) {
    case 'ancestry':
      // A new ancestry wipes the heritage + cached slug + ancestry
      // feat + ancestry boost picks + language picks (the old
      // choices may not be valid under the new ancestry).
      return {
        ...draft,
        ancestry: slot,
        ancestrySlug: null,
        heritage: null,
        heritageSlug: null,
        ancestryFeat: null,
        ancestryBoosts: [],
        languagePicks: [],
        languageAllowance: null,
      };
    case 'heritage':
      // New heritage resets the cached slug + ancestry-feat pick
      // (versatile heritages open up a different feat pool, so the
      // previous pick may not still qualify).
      return { ...draft, heritage: slot, heritageSlug: null, ancestryFeat: null };
    case 'class':
      // New class wipes the cached slug + class feat + key attribute
      // pick for the same reason. Skill picks also reset since the
      // free-skill count (class.additional) is class-specific.
      return {
        ...draft,
        class: slot,
        classSlug: null,
        classFeat: null,
        classKeyAbility: null,
        skillPicks: [],
        classGrantsL1Feat: null,
      };
    case 'background':
      return { ...draft, background: slot, backgroundBoosts: [] };
    case 'deity':
      return { ...draft, deity: slot };
    case 'class-feat':
      return { ...draft, classFeat: slot };
    case 'ancestry-feat':
      return { ...draft, ancestryFeat: slot };
  }
}

// Used by SkillsStep and ReviewStep. Pretty-prints `acrobatics` →
// `Acrobatics`, `lore-warfare` → `Lore Warfare`, etc.
export function prettySkillLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Used by LanguagesStep and ReviewStep. Same shape as
// `prettySkillLabel` but kept as its own export so the call sites
// document what's being humanised.
export function prettyLanguageLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
