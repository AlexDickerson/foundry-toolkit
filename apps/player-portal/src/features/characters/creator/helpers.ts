import { api } from '@/features/characters/api';
import type { CompendiumMatch } from '@/features/characters/types';
import { BOOSTS_REQUIRED, EMPTY_DRAFT, STATIC_PICKER_FILTERS } from './constants';
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
      // feat + ancestry boost picks + language picks + alternate-boost
      // opt-in (the old choices may not be valid under the new ancestry).
      return {
        ...draft,
        ancestry: slot,
        ancestrySlug: null,
        heritage: null,
        heritageSlug: null,
        ancestryFeat: null,
        ancestryBoosts: [],
        alternateAncestryBoosts: null,
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

// Splits a flat heritage list into primary (ancestry-specific) and versatile
// (any-ancestry) groups. The `isVersatile` flag is set by the server when
// `system.ancestry === null` on the heritage item — pf2e's signal for
// versatile heritages (Aiuvarin, Changeling, Beastkin, …).
export function groupHeritages(items: CompendiumMatch[]): {
  primary: CompendiumMatch[];
  versatile: CompendiumMatch[];
} {
  return {
    primary: items.filter((m) => m.isVersatile !== true),
    versatile: items.filter((m) => m.isVersatile === true),
  };
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

// ─── Creator lifecycle flags ────────────────────────────────────────────────

// Persists creator state flags to the actor. Called on "Save & Continue Later"
// (mode='in-progress') and on "Open sheet →" (mode='completed'). Uses Foundry's
// merge semantics — only the specified keys are touched; other flags survive.
export async function saveDraftFlags(
  actorId: string,
  draft: Draft,
  mode: 'in-progress' | 'completed',
): Promise<void> {
  const tkFlags: Record<string, unknown> =
    mode === 'in-progress'
      ? {
          creatorInProgress: true,
          creatorCompleted: false,
          creatorDraft: JSON.stringify(draft),
        }
      : {
          creatorInProgress: false,
          creatorCompleted: true,
          creatorVersion: 1,
          // Keep the draft so "Edit" can restore the full wizard state
          // rather than falling back to the partial item-scan path.
          creatorDraft: JSON.stringify(draft),
        };

  await api.updateActor(actorId, {
    flags: { 'foundry-toolkit': tkFlags },
  });
}

// ─── Hydration ──────────────────────────────────────────────────────────────

export type HydrateResult =
  | { draft: Draft; error: null }
  | { draft: null; error: string };

// Loads an existing actor and reconstructs a wizard Draft from it.
//
// Primary path: restore from the `creatorDraft` JSON stored in
// flags['foundry-toolkit'] — written by "Save & Continue Later" and by
// "Open sheet →". Full fidelity: all picks, boosts, skill/language choices.
//
// Fallback (manually-created actor or very old actor without the flag):
// Identity fields come from system.details. Picks (ancestry, heritage, class,
// background, deity, feats) are reconstructed from the actor's embedded items
// by searching the compendium for a matching name — no item sourceId needed.
// Boost/skill/language picks are left at defaults (impossible to separate the
// user's free choices from class/ancestry grants without the stored draft).
export async function hydrateFromActor(actorId: string): Promise<HydrateResult> {
  let actor;
  try {
    actor = await api.getPreparedActor(actorId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { draft: null, error: msg };
  }

  // Primary path: sidecar draft flag (set on finish + save-and-continue)
  const tkFlags = actor.flags?.['foundry-toolkit'] ?? {};
  const storedDraft = tkFlags['creatorDraft'];
  if (typeof storedDraft === 'string') {
    try {
      const parsed = JSON.parse(storedDraft) as Partial<Draft>;
      return { draft: { ...EMPTY_DRAFT, ...parsed }, error: null };
    } catch {
      // Fall through to partial hydration if the JSON is somehow corrupt.
    }
  }

  // Fallback: reconstruct from actor state
  const draft: Draft = { ...EMPTY_DRAFT };

  // Identity fields — pf2e stores these as { value: string } objects
  const details = actor.system['details'] as Record<string, unknown> | undefined;
  draft.name = actor.name !== 'New Character' ? actor.name : '';
  draft.gender = extractDemographicValue(details?.['gender']);
  draft.age = extractDemographicValue(details?.['age']);
  draft.ethnicity = extractDemographicValue(details?.['ethnicity']);
  draft.nationality = extractDemographicValue(details?.['nationality']);

  // Reconstruct pick slots from embedded items.
  // Try flags.core.sourceId first (fast, no network call). If that's missing
  // — which happens when item.toObject(false) doesn't surface item flags, or
  // for actors created before this PR — fall back to a compendium name search
  // so the user sees their existing picks pre-selected in the creator.
  for (const item of actor.items) {
    let match: CompendiumMatch | null = null;

    // Fast path: parse the compendium source UUID off the embedded item flag
    const sourceId = item.flags?.['core']?.['sourceId'];
    if (typeof sourceId === 'string') {
      match = buildMatchFromSourceId(item.name, item.type, item.img, sourceId);
    }

    // Slow path: name search against the canonical pack for this item type
    if (match === null) {
      match = await searchMatchByName(item.name, item.type);
    }

    if (match === null) continue;

    if (item.type === 'ancestry' && draft.ancestry === null) {
      draft.ancestry = { match, itemId: item.id };
    } else if (item.type === 'heritage' && draft.heritage === null) {
      draft.heritage = { match, itemId: item.id };
    } else if (item.type === 'class' && draft.class === null) {
      draft.class = { match, itemId: item.id };
    } else if (item.type === 'background' && draft.background === null) {
      draft.background = { match, itemId: item.id };
    } else if (item.type === 'deity' && draft.deity === null) {
      draft.deity = { match, itemId: item.id };
    } else if (item.type === 'feat') {
      const location = typeof item.system['location'] === 'string' ? item.system['location'] : '';
      if (location === 'class-1' && draft.classFeat === null) {
        draft.classFeat = { match, itemId: item.id };
      } else if (location === 'ancestry-1' && draft.ancestryFeat === null) {
        draft.ancestryFeat = { match, itemId: item.id };
      }
    }
  }

  return { draft, error: null };
}

// Canonical packs to search for each item type in the fallback hydration.
const FALLBACK_PACKS_BY_TYPE: Partial<Record<string, string[]>> = {
  ancestry: ['pf2e.ancestries'],
  heritage: ['pf2e.heritages'],
  class: ['pf2e.classes'],
  background: ['pf2e.backgrounds'],
  deity: ['pf2e.deities'],
  feat: ['pf2e.feats-srd'],
};

// Searches the appropriate pack for an item by exact name (case-insensitive).
// Returns null if the type has no known pack, the search fails, or no match found.
async function searchMatchByName(name: string, type: string): Promise<CompendiumMatch | null> {
  const packIds = FALLBACK_PACKS_BY_TYPE[type];
  if (packIds === undefined) return null;
  try {
    const { matches } = await api.searchCompendium({ packIds, documentType: 'Item', q: name });
    return matches.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}

// Extracts the string value from a pf2e demographic field (stored as
// `{ value: string }` on the actor system object).
function extractDemographicValue(field: unknown): string {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && 'value' in (field)) {
    const v = (field).value;
    return typeof v === 'string' ? v : '';
  }
  return '';
}

// Parses a Foundry compendium UUID (e.g. "Compendium.pf2e.ancestries.Item.abc")
// into a minimal CompendiumMatch. packLabel is left empty — not available from
// the embedded item, and not used for functionality (only display in the picker).
function buildMatchFromSourceId(
  name: string,
  type: string,
  img: string,
  sourceId: string,
): CompendiumMatch | null {
  const m = /^Compendium\.([^.]+\.[^.]+)\.\w+\.(.+)$/.exec(sourceId);
  if (m === null) return null;
  return {
    packId: m[1]!,
    packLabel: '',
    documentId: m[2]!,
    uuid: sourceId,
    name,
    type,
    img,
  };
}
