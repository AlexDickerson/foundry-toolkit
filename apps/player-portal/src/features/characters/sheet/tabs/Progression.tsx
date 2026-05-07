import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/features/characters/api';
import { ABILITY_KEYS, isClassItem, isFeatItem } from '@/features/characters/types';
import type {
  AbilityKey,
  ClassFeatureEntry,
  ClassItem,
  CompendiumDocument,
  CompendiumMatch,
  CompendiumSearchOptions,
  PreparedActorItem,
  ProficiencyRank,
} from '@/features/characters/types';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { useUuidHover } from '@/shared/hooks/useUuidHover';
import type { CharacterContext } from '@/features/characters/internal/prereqs';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { AbilityBoostPicker } from '@/features/characters/internal/AbilityBoostPicker';
import { useCreatorPickerProps } from '@/features/characters/internal/useCreatorPickerProps';
import { SkillIncreasePicker } from '@/features/characters/internal/SkillIncreasePicker';
import { CompendiumPicker } from '@/features/characters/internal/CompendiumPicker';
import { prefetchDocuments } from '@/features/characters/internal/compendium-prefetch';
import { extractDetailBio } from '@/features/characters/internal/compendium-doc-fields';
import {
  POPOVER_WIDTH,
  POPOVER_HOVER_OPEN_DELAY_MS,
  POPOVER_HOVER_CLOSE_DELAY_MS,
  pickVerticalSlot,
  clampPopoverLeft,
} from '@/shared/lib/popover-positioning';

// All picks share the same map keyed by `${level}:${slot}`. The value
// is a discriminated union so each slot kind can store the shape it
// needs to reconstruct its chip / later feed into the scratch-actor.
type Pick =
  | { kind: 'feat'; match: CompendiumMatch; actorItemId?: string }
  | { kind: 'skill-increase'; skill: string; newRank: ProficiencyRank }
  | { kind: 'ability-boosts'; abilities: AbilityKey[] };

interface Props {
  actorId: string;
  characterLevel: number;
  items: PreparedActorItem[];
  characterContext: CharacterContext;
  onActorChanged: () => void;
  /** Deserialized from `actor.flags['player-portal']['progression-picks']`.
   *  Hydrates skill-increase and ability-boost picks across page refreshes. */
  persistedPicks?: Record<string, unknown>;
}

// pf2e ability boosts happen at these fixed levels (4 boosts each). This
// is the only piece of the progression that isn't encoded on the class
// item itself (every other slot lives in `class.system.*FeatLevels`).
// See pf2e Core Rulebook "Advancing Your Character" (p.32).
const ABILITY_BOOST_LEVELS: readonly number[] = [5, 10, 15, 20];

// Levels every character can reach (pf2e core: 1-20).
const LEVELS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

// Slot-key for the selection map. One level can open several slot types,
// and each could eventually have its own pick (two class feats at L12,
// a class feat + skill feat at L2, etc.), so we key by `${level}:${slot}`.
type SlotKey = string;
const slotKey = (level: number, slot: SlotType): SlotKey => `${level.toString()}:${slot}`;

// Progression tab — vertical timeline of levels 1-20, each row showing
// the auto-granted class features at that level plus chips for every
// slot the pf2e rules open up (class feat, ancestry feat, skill feat,
// general feat, skill increase, ability boosts).
//
// Reads the character's class item from items[type='class'] and walks
// `class.system.items` + the `*FeatLevels` arrays to build each row.
// The current character level is highlighted; past levels are muted,
// future levels render as a normal preview.
//
// Class-feat slots are clickable — they open a CompendiumPicker scoped
// to the character's class trait and capped at the slot's level (with
// the creator's prereq + source-filter behavior layered in via
// useCreatorPickerProps). Picks for current/past levels write to Foundry immediately;
// picks for future levels are stored in flags only and auto-applied when
// the character reaches that level.
export function Progression({ actorId, characterLevel, items, characterContext, onActorChanged, persistedPicks }: Props): React.ReactElement {
  const classItem = items.find(isClassItem);
  const [picks, setPicks] = useState<Map<SlotKey, Pick>>(new Map());
  const [pickerTarget, setPickerTarget] = useState<{ level: number; slot: SlotType } | null>(null);
  // Tracks the previous characterLevel so the hydration effect can detect
  // level-ups and auto-apply picks that just became reachable.
  const prevCharacterLevelRef = useRef(characterLevel);

  // Hydrate the picks Map from embedded feat items' `system.location`
  // strings. pf2e tags feats added via its own "Add to Slot" flow
  // with `<category>-<level>` (e.g. "ancestry-1", "class-2"); the
  // character-creator wizard sets the same string when it
  // piecemeal-adds L1 feats. This seeds the chips so the progression
  // timeline reflects what's already on the actor. Local edits from
  // within this tab continue to mutate the same Map.
  useEffect(() => {
    const hydrated = new Map<SlotKey, Pick>();
    for (const item of items) {
      if (item.type !== 'feat') continue;
      const rawLocation = (item.system as { location?: unknown } | null)?.location;
      if (typeof rawLocation !== 'string' || rawLocation.length === 0) continue;
      const parsed = parseFeatLocation(rawLocation);
      if (parsed === null) continue;
      hydrated.set(slotKey(parsed.level, parsed.slot), {
        kind: 'feat',
        actorItemId: item.id,
        match: {
          packId: '',
          packLabel: '',
          documentId: item.id,
          // Use the actor-local item id as a stand-in uuid: the
          // PreparedActor payload drops `flags.core.sourceId` so we
          // don't know the compendium origin. Hover previews won't
          // resolve, but the chip shows name + img correctly.
          uuid: item.id,
          name: item.name,
          type: item.type,
          img: item.img,
        },
      });
    }
    // Hydrate non-feat picks from the Foundry actor flag so they survive
    // a full page refresh. Feat picks are always re-derived from items
    // (system.location is authoritative); flags are only for the kinds
    // that Foundry doesn't encode per-slot in the prepared payload.
    if (persistedPicks !== undefined) {
      for (const [key, raw] of Object.entries(persistedPicks)) {
        if (hydrated.has(key)) continue; // feat from items takes precedence
        const pick = parsePersistedPick(raw);
        if (pick !== null) hydrated.set(key, pick);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks((prev) => {
      const next = new Map(hydrated);
      // In-memory fallback: preserve any non-feat picks not yet reflected in
      // flags (the optimistic window between commitPick and onActorChanged
      // completing its /prepared reload).
      for (const [key, pick] of prev) {
        if (pick.kind !== 'feat' && !next.has(key)) next.set(key, pick);
      }
      return next;
    });
    // Auto-apply: when the character levels up, fire the deferred system
    // writes for any non-feat picks that just became reachable (they were
    // stored in flags while the level was still future).
    const prevLevel = prevCharacterLevelRef.current;
    prevCharacterLevelRef.current = characterLevel;
    if (characterLevel > prevLevel) {
      for (const [key, pick] of hydrated) {
        if (pick.kind === 'feat') continue;
        const parsed = parseSlotKey(key);
        if (!parsed) continue;
        const { level } = parsed;
        if (level <= prevLevel || level > characterLevel) continue;
        if (pick.kind === 'skill-increase') {
          void api
            .updateActor(actorId, {
              system: { skills: { [pick.skill]: { rank: pick.newRank } } },
              flags: buildProgressionPicksFlags(hydrated),
            })
            .then(() => { onActorChanged(); })
            .catch((err: unknown) => { console.warn('Failed to auto-apply skill increase', err); });
        } else if (pick.kind === 'ability-boosts') {
          void api
            .updateActor(actorId, {
              system: { build: { attributes: { boosts: { [level]: pick.abilities } } } },
              flags: buildProgressionPicksFlags(hydrated),
            })
            .then(() => { onActorChanged(); })
            .catch((err: unknown) => { console.warn('Failed to auto-apply ability boosts', err); });
        }
      }
    }
    // Re-run when items, persisted flag data, or character level changes —
    // all three arrive together via the actor refetch triggered by onActorChanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, persistedPicks, characterLevel]);

  // Prefetched full documents for every class feature on this class,
  // indexed by uuid. A ref-backed cache survives React 18 StrictMode's
  // double-mount (cleanup cancels the first run but the cached docs
  // live on). `docsVersion` bumps to force a re-render after each
  // cache write since React can't observe ref mutations.
  //
  // Declared before the `!classItem` early return so React can call the
  // hooks in the same order on every render.
  const featureDocCacheRef = useRef<Map<string, CompendiumDocument>>(new Map());
  const featureDocErrorsRef = useRef<Set<string>>(new Set());
  const [docsVersion, setDocsVersion] = useState(0);
  useEffect(() => {
    if (!classItem) return;
    const all = Object.values(classItem.system.items);
    if (all.length === 0) return;
    let cancelled = false;
    const cache = featureDocCacheRef.current;
    const errors = featureDocErrorsRef.current;
    void prefetchDocuments(all, cache, {
      isCancelled: () => cancelled,
      onDocHydrated: (uuid) => {
        // Successful (re-)fetch clears any prior failure marker so the
        // popover swaps from "couldn't load" back to the description.
        errors.delete(uuid);
        setDocsVersion((v) => v + 1);
      },
      onError: (uuid, err) => {
        // Record the miss so the popover can show "couldn't load"
        // instead of a forever-spinning "Loading…".
        errors.add(uuid);
        setDocsVersion((v) => v + 1);
        console.warn('Failed to prefetch class feature', uuid, err);
      },
    });
    return (): void => {
      cancelled = true;
    };
  }, [classItem]);

  // Fast lookup from the actor's local feat id → feat item, so the
  // picked-chip hover popover can resolve hydrated picks (whose uuids
  // are actor-local placeholders, not compendium UUIDs) against the
  // item on the character directly. Fresh picks out of the picker keep
  // their real compendium uuid and hit the API as normal.
  //
  // Declared before the `!classItem` early return so React can call
  // the hooks in the same order on every render.
  const feathItemById = useMemo(() => {
    const map = new Map<string, PreparedActorItem>();
    for (const item of items) {
      if (isFeatItem(item)) map.set(item.id, item);
    }
    return map;
  }, [items]);
  const resolveLocalPickDoc = useCallback(
    (uuid: string): CompendiumDocument | undefined => {
      const item = feathItemById.get(uuid);
      if (!item) return undefined;
      return {
        id: item.id,
        uuid: item.id,
        name: item.name,
        type: item.type,
        img: item.img,
        system: item.system,
      };
    },
    [feathItemById],
  );
  const pickedHover = useUuidHover({ resolveLocal: resolveLocalPickDoc });

  if (!classItem) {
    return <p className="text-sm text-pf-alt-dark">No class item on this character.</p>;
  }

  const sys = classItem.system;
  const classTrait = sys.slug ?? classItem.name.toLowerCase();
  // `docsVersion` read ensures dependents of the cache re-render when
  // it grows. Not semantically meaningful, just a subscription hook.
  void docsVersion;
  // Ancestry slot picker needs the ancestry's trait (e.g. "human").
  // The ancestry item on the character carries `system.slug`; fall back
  // to the lower-cased name if the slug is missing.
  const ancestryItem = items.find((i) => i.type === 'ancestry');
  const ancestryTrait =
    ancestryItem !== undefined
      ? (((ancestryItem.system as { slug?: unknown }).slug as string | undefined) ?? ancestryItem.name.toLowerCase())
      : undefined;
  const featuresByLevel = groupFeaturesByLevel(sys.items);
  const levelSlots = buildLevelSlotMap(sys);

  const openPicker = (level: number, slot: SlotType): void => {
    setPickerTarget({ level, slot });
  };
  const closePicker = (): void => {
    setPickerTarget(null);
  };
  const commitPick = (pick: Pick): void => {
    if (!pickerTarget) return;
    const level = pickerTarget.level;
    const slot = pickerTarget.slot;
    const key = slotKey(level, slot);
    const existingPick = picks.get(key);

    // Compute post-pick state synchronously so flag serialization reflects
    // the new pick without waiting for React to flush the setState.
    const newPicksForFlag = new Map(picks);
    newPicksForFlag.set(key, pick);

    // Optimistic local update — closes the picker immediately.
    setPicks((prev) => {
      const next = new Map(prev);
      next.set(key, pick);
      return next;
    });
    setPickerTarget(null);

    const isFutureLevel = level > characterLevel;

    const rollback = (): void => {
      setPicks((prev) => {
        const next = new Map(prev);
        if (existingPick !== undefined) next.set(key, existingPick);
        else next.delete(key);
        return next;
      });
    };

    if (pick.kind === 'feat') {
      if (isFutureLevel) {
        // Future feats are planning-only: keep in local state, no API call.
        // They'll be applied via addItemFromCompendium when the user reaches
        // this level and explicitly picks in the now-current slot.
        return;
      }
      const location = featSlotLocationFor(slot, level);
      void api
        .addItemFromCompendium(actorId, {
          packId: pick.match.packId,
          itemId: pick.match.documentId,
          ...(location !== null ? { systemOverrides: { location } } : {}),
        })
        .then((ref) => {
          // Attach the actor-local item id so subsequent clears can delete it.
          setPicks((prev) => {
            const current = prev.get(key);
            if (!current || current.kind !== 'feat') return prev;
            const next = new Map(prev);
            next.set(key, { ...current, actorItemId: ref.id });
            return next;
          });
          // Remove whichever item was filling this slot before, if any.
          if (existingPick?.kind === 'feat' && existingPick.actorItemId !== undefined) {
            void api.deleteActorItem(actorId, existingPick.actorItemId).catch((err: unknown) => {
              console.warn('Failed to clean up replaced feat item', err);
            });
          }
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to persist feat pick', err);
          rollback();
        });
    } else if (pick.kind === 'skill-increase') {
      if (isFutureLevel) {
        // Future level: store the planned pick in flags only; the system write
        // fires automatically when the character reaches this level.
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to save planned skill increase', err);
            rollback();
          });
        return;
      }
      void api
        .updateActor(actorId, {
          system: { skills: { [pick.skill]: { rank: pick.newRank } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to persist skill increase', err);
          rollback();
        });
    } else if (pick.kind === 'ability-boosts') {
      if (isFutureLevel) {
        // Future level: store the planned pick in flags only.
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to save planned ability boosts', err);
            rollback();
          });
        return;
      }
      void api
        .updateActor(actorId, {
          system: { build: { attributes: { boosts: { [level]: pick.abilities } } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to persist ability boosts', err);
          rollback();
        });
    }
  };
  const clearPick = (level: number, slot: SlotType): void => {
    const key = slotKey(level, slot);
    const existingPick = picks.get(key);

    // Compute post-clear state for flag serialization.
    const newPicksForFlag = new Map(picks);
    newPicksForFlag.delete(key);

    // Optimistic removal.
    setPicks((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });

    if (existingPick === undefined) return;

    const isFutureLevel = level > characterLevel;

    const undoClear = (): void => {
      setPicks((prev) => {
        const next = new Map(prev);
        next.set(key, existingPick);
        return next;
      });
    };

    if (existingPick.kind === 'feat') {
      if (isFutureLevel) {
        // Future feat was never added to the actor — nothing to undo in Foundry.
        return;
      }
      if (existingPick.actorItemId === undefined) return;
      void api
        .deleteActorItem(actorId, existingPick.actorItemId)
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to delete feat item', err);
          undoClear();
        });
    } else if (existingPick.kind === 'skill-increase') {
      if (isFutureLevel) {
        // Planned pick was never written to system — only remove from flags.
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to remove planned skill increase from flags', err);
            undoClear();
          });
        return;
      }
      const prevRank = (existingPick.newRank - 1) as ProficiencyRank;
      void api
        .updateActor(actorId, {
          system: { skills: { [existingPick.skill]: { rank: prevRank } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to revert skill increase', err);
          undoClear();
        });
    } else if (existingPick.kind === 'ability-boosts') {
      if (isFutureLevel) {
        // Planned pick was never written to system — only remove from flags.
        void api
          .updateActor(actorId, { flags: buildProgressionPicksFlags(newPicksForFlag) })
          .catch((err: unknown) => {
            console.warn('Failed to remove planned ability boosts from flags', err);
            undoClear();
          });
        return;
      }
      void api
        .updateActor(actorId, {
          system: { build: { attributes: { boosts: { [level]: [] } } } },
          flags: buildProgressionPicksFlags(newPicksForFlag),
        })
        .then(() => {
          onActorChanged();
        })
        .catch((err: unknown) => {
          console.warn('Failed to clear ability boosts', err);
          undoClear();
        });
    }
  };

  const pickerFilters = pickerTarget
    ? buildPickerFilters(pickerTarget.slot, pickerTarget.level, classTrait, ancestryTrait)
    : null;

  return (
    <section className="space-y-4 *:rounded-lg *:border *:border-pf-border *:bg-pf-bg-dark *:p-4" data-section="progression">
      <div>
        <SectionHeader band>{classItem.name} Progression</SectionHeader>
        <ol className="space-y-1.5" {...pickedHover.delegationHandlers}>
        {/* eslint-disable-next-line react-hooks/refs -- cache snapshot taken per render; docsVersion bump in useEffect re-renders whenever either cache mutates */}
        {LEVELS.map((level) => {
          const features = featuresByLevel.get(level) ?? [];
          const slots = levelSlots.get(level) ?? [];
          return (
            <LevelRow
              key={level}
              level={level}
              characterLevel={characterLevel}
              features={features}
              slots={slots}
              picks={picks}
              featureDocs={featureDocCacheRef.current}
              featureDocErrors={featureDocErrorsRef.current}
              onOpenPicker={openPicker}
              onClearPick={clearPick}
            />
          );
        })}
        </ol>
      </div>
      {pickedHover.popover}
      {pickerTarget && pickerFilters && (
        <ProgressionPicker
          key={`${pickerTarget.level.toString()}:${pickerTarget.slot}`}
          title={pickerTitleFor(pickerTarget.slot, pickerTarget.level)}
          filters={pickerFilters}
          characterContext={characterContext}
          onPick={(match): void => {
            commitPick({ kind: 'feat', match });
          }}
          onClose={closePicker}
        />
      )}
      {pickerTarget?.slot === 'skill-increase' && (
        <SkillIncreasePicker
          level={pickerTarget.level}
          characterContext={characterContext}
          onPick={(skill, newRank): void => {
            commitPick({ kind: 'skill-increase', skill, newRank });
          }}
          onClose={closePicker}
        />
      )}
      {pickerTarget?.slot === 'ability-boosts' &&
        (() => {
          const seed = abilityBoostInitialFor(picks, pickerTarget.level);
          const boostProps = {
            level: pickerTarget.level,
            characterContext,
            onPick: (abilities: AbilityKey[]): void => {
              commitPick({ kind: 'ability-boosts', abilities });
            },
            onClose: closePicker,
            ...(seed ? { initialSelection: seed } : {}),
          };
          return <AbilityBoostPicker {...boostProps} />;
        })()}
    </section>
  );
}

// If the user has already picked boosts for this slot, re-opening the
// picker should seed with their last selection so editing doesn't
// force a full re-pick.
function abilityBoostInitialFor(picks: Map<SlotKey, Pick>, level: number): readonly AbilityKey[] | undefined {
  const existing = picks.get(slotKey(level, 'ability-boosts'));
  return existing?.kind === 'ability-boosts' ? existing.abilities : undefined;
}

// Map from slot kind → the name used in the picker header. Only covers
// slot types the picker actually handles; other slots (skill increase,
// ability boosts) don't open a feat picker.
const PICKER_TITLE: Partial<Record<SlotType, string>> = {
  'class-feat': 'Class Feat',
  'ancestry-feat': 'Ancestry Feat',
  'skill-feat': 'Skill Feat',
  'general-feat': 'General Feat',
};

function pickerTitleFor(slot: SlotType, level: number): string {
  return `Pick a ${PICKER_TITLE[slot] ?? 'Feat'} (Level ${level.toString()})`;
}

interface PickerFilters {
  packIds: string[];
  documentType: string;
  traits: string[];
  maxLevel: number;
}

// Different feat slot types narrow on different pf2e trait tags. All of
// them live in the feats-srd pack, all items. Skill feat slots only
// accept items tagged `skill`; general slots accept anything tagged
// `general` (which by pf2e convention includes skill feats). Ancestry
// slots are scoped to the character's ancestry trait.
function buildPickerFilters(
  slot: SlotType,
  level: number,
  classTrait: string,
  ancestryTrait: string | undefined,
): PickerFilters | null {
  const base = {
    packIds: ['pf2e.feats-srd'],
    documentType: 'Item',
    maxLevel: level,
  };
  switch (slot) {
    case 'class-feat':
      return { ...base, traits: [classTrait] };
    case 'ancestry-feat':
      return ancestryTrait !== undefined ? { ...base, traits: [ancestryTrait] } : null;
    case 'skill-feat':
      return { ...base, traits: ['skill'] };
    case 'general-feat':
      return { ...base, traits: ['general'] };
    default:
      return null;
  }
}

// ─── Row ───────────────────────────────────────────────────────────────

type LevelState = 'past' | 'current' | 'future';

function LevelRow({
  level,
  characterLevel,
  features,
  slots,
  picks,
  featureDocs,
  featureDocErrors,
  onOpenPicker,
  onClearPick,
}: {
  level: number;
  characterLevel: number;
  features: ClassFeatureEntry[];
  slots: readonly SlotType[];
  picks: Map<SlotKey, Pick>;
  featureDocs: Map<string, CompendiumDocument>;
  featureDocErrors: Set<string>;
  onOpenPicker: (level: number, slot: SlotType) => void;
  onClearPick: (level: number, slot: SlotType) => void;
}): React.ReactElement {
  const state: LevelState = level < characterLevel ? 'past' : level === characterLevel ? 'current' : 'future';
  return (
    <li
      data-level={level}
      data-state={state}
      // The hover popover is portaled to <body>, so it escapes this
      // row's opacity group — past-level popovers render full-
      // strength even when the row itself is dimmed.
      className={[
        'grid min-h-12 grid-cols-[3rem_1fr] items-center gap-3 rounded border px-3 py-2',
        state === 'current' ? 'border-pf-primary bg-pf-tertiary/30' : 'border-pf-border bg-pf-bg',
        state === 'past' ? 'opacity-60' : '',
      ].join(' ')}
    >
      <LevelBadge level={level} state={state} />
      <div className="min-w-0 space-y-1.5">
        {features.length > 0 && <FeatureList features={features} docs={featureDocs} docErrors={featureDocErrors} />}
        {slots.length > 0 && (
          <SlotChips level={level} slots={slots} picks={picks} onOpenPicker={onOpenPicker} onClearPick={onClearPick} />
        )}
        {features.length === 0 && slots.length === 0 && (
          <span className="text-xs italic text-pf-alt">No class features or new slots.</span>
        )}
      </div>
    </li>
  );
}

function LevelBadge({ level, state }: { level: number; state: LevelState }): React.ReactElement {
  return (
    <span
      className={[
        'flex h-8 w-12 items-center justify-center rounded border font-mono text-sm font-semibold tabular-nums',
        state === 'current'
          ? 'border-pf-primary bg-pf-primary text-white'
          : 'border-pf-border bg-pf-bg-dark text-pf-alt-dark',
      ].join(' ')}
      title={state === 'current' ? 'Current level' : state === 'past' ? 'Past level' : 'Upcoming level'}
    >
      L{level}
    </span>
  );
}

function FeatureList({
  features,
  docs,
  docErrors,
}: {
  features: ClassFeatureEntry[];
  docs: Map<string, CompendiumDocument>;
  docErrors: Set<string>;
}): React.ReactElement {
  return (
    <ul className="flex flex-wrap gap-1.5" data-role="features">
      {features.map((f) => (
        <FeatureChip key={f.uuid} feature={f} doc={docs.get(f.uuid)} failed={docErrors.has(f.uuid)} />
      ))}
    </ul>
  );
}

function FeatureChip({
  feature,
  doc,
  failed,
}: {
  feature: ClassFeatureEntry;
  doc: CompendiumDocument | undefined;
  failed: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; transform?: string; left: number; maxHeight: number } | null>(null);
  const chipRef = useRef<HTMLLIElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const uuidHover = useUuidHover();

  const cancelClose = (): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const cancelOpen = (): void => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };
  const scheduleClose = (): void => {
    cancelOpen();
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, POPOVER_HOVER_CLOSE_DELAY_MS);
  };
  const scheduleOpen = (): void => {
    cancelClose();
    if (open) return;
    cancelOpen();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      if (!chipRef.current) return;
      const rect = chipRef.current.getBoundingClientRect();
      const left = clampPopoverLeft(rect.left);
      const vertical = pickVerticalSlot(rect);
      setPos({ ...vertical, left });
      setOpen(true);
    }, POPOVER_HOVER_OPEN_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current !== null) clearTimeout(openTimerRef.current);
    },
    [],
  );

  const description = doc ? extractDetailBio(doc).description : undefined;
  return (
    <li
      ref={chipRef}
      className="inline-flex items-center gap-1.5 rounded border border-pf-border bg-pf-bg px-1.5 py-0.5 text-xs text-pf-text"
      data-feature-uuid={feature.uuid}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <img src={feature.img} alt="" className="h-4 w-4 rounded bg-pf-bg-dark" />
      <span className="truncate">{feature.name}</span>
      {open &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            data-testid="feature-tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              maxHeight: pos.maxHeight,
              overflowY: 'auto',
              transform: pos.transform,
            }}
            className="z-50 rounded border border-pf-border bg-pf-bg p-4 text-left shadow-xl"
          >
            <div className="mb-2 flex items-center gap-2">
              <img src={feature.img} alt="" className="h-10 w-10 rounded border border-pf-border bg-pf-bg-dark" />
              <div className="min-w-0 flex-1">
                <h4 className="font-serif text-base font-semibold text-pf-text">{feature.name}</h4>
                <p className="text-[10px] uppercase tracking-widest text-pf-alt">Level {feature.level}</p>
              </div>
            </div>
            {description !== undefined && description.length > 0 ? (
              <div
                {...uuidHover.delegationHandlers}
                className="text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2 [&_p]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: enrichDescription(description) }}
              />
            ) : failed ? (
              <p className="text-xs italic text-pf-primary">
                Couldn&apos;t load description — check the devtools console.
              </p>
            ) : (
              <p className="text-xs italic text-pf-alt">{doc ? 'No description.' : 'Loading…'}</p>
            )}
          </div>,
          document.body,
        )}
      {uuidHover.popover}
    </li>
  );
}

// ─── Slot chips ────────────────────────────────────────────────────────

type SlotType = 'class-feat' | 'ancestry-feat' | 'skill-feat' | 'general-feat' | 'skill-increase' | 'ability-boosts';

const SLOT_LABEL: Record<SlotType, string> = {
  'class-feat': 'Class Feat',
  'ancestry-feat': 'Ancestry Feat',
  'skill-feat': 'Skill Feat',
  'general-feat': 'General Feat',
  'skill-increase': 'Skill Increase',
  'ability-boosts': 'Ability Boosts (4)',
};

const SLOT_CLASSES: Record<SlotType, string> = {
  'class-feat': 'border-pf-primary bg-pf-primary/10 text-pf-primary',
  'ancestry-feat': 'border-pf-secondary bg-pf-secondary/10 text-pf-secondary',
  'skill-feat': 'border-pf-alt-dark bg-pf-alt/10 text-pf-alt-dark',
  'general-feat': 'border-pf-tertiary-dark bg-pf-tertiary/40 text-pf-alt-dark',
  'skill-increase': 'border-pf-prof-expert bg-pf-prof-expert/10 text-pf-prof-expert',
  'ability-boosts': 'border-pf-rarity-unique bg-pf-rarity-unique/10 text-pf-rarity-unique',
};

const CLICKABLE_SLOTS: ReadonlySet<SlotType> = new Set([
  'class-feat',
  'ancestry-feat',
  'skill-feat',
  'general-feat',
  'skill-increase',
  'ability-boosts',
]);

function SlotChips({
  level,
  slots,
  picks,
  onOpenPicker,
  onClearPick,
}: {
  level: number;
  slots: readonly SlotType[];
  picks: Map<SlotKey, Pick>;
  onOpenPicker: (level: number, slot: SlotType) => void;
  onClearPick: (level: number, slot: SlotType) => void;
}): React.ReactElement {
  return (
    <ul className="flex flex-wrap gap-1" data-role="slots">
      {slots.map((slot) => {
        const pick = picks.get(slotKey(level, slot));
        if (pick) {
          return (
            <li key={slot} data-slot={slot} data-pick-kind={pick.kind}>
              <PickedChip
                slot={slot}
                pick={pick}
                onClear={(): void => {
                  onClearPick(level, slot);
                }}
              />
            </li>
          );
        }
        if (CLICKABLE_SLOTS.has(slot)) {
          return (
            <li key={slot} data-slot={slot}>
              <button
                type="button"
                onClick={(): void => {
                  onOpenPicker(level, slot);
                }}
                className={[
                  'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  SLOT_CLASSES[slot],
                  'hover:brightness-95',
                ].join(' ')}
                data-testid="slot-open-picker"
              >
                + {SLOT_LABEL[slot]}
              </button>
            </li>
          );
        }
        return (
          <li
            key={slot}
            data-slot={slot}
            className={[
              'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              SLOT_CLASSES[slot],
            ].join(' ')}
          >
            {SLOT_LABEL[slot]}
          </li>
        );
      })}
    </ul>
  );
}

function PickedChip({ slot, pick, onClear }: { slot: SlotType; pick: Pick; onClear: () => void }): React.ReactElement {
  const body = renderPickBody(pick);
  const title = renderPickTitle(slot, pick);
  const featUuid = pick.kind === 'feat' ? pick.match.uuid : undefined;
  return (
    <span
      // `data-uuid` triggers the rich hover popover wired at the
      // Progression level (Parent <ol> holds the delegation handlers);
      // the Progression-level resolver falls back to the actor-local
      // feat item when the uuid isn't a compendium UUID, so hydrated
      // picks show their description too.
      data-pick-uuid={featUuid}
      data-uuid={featUuid}
      className="inline-flex items-center gap-1 rounded border border-pf-border bg-pf-bg pl-1 pr-0.5 text-[11px] text-pf-text"
      title={title}
    >
      {body}
      <button
        type="button"
        aria-label={`Clear ${SLOT_LABEL[slot]} pick`}
        onClick={onClear}
        className="ml-0.5 rounded px-1 text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
      >
        ×
      </button>
    </span>
  );
}

function renderPickBody(pick: Pick): React.ReactElement {
  switch (pick.kind) {
    case 'feat':
      return (
        <>
          {pick.match.img && <img src={pick.match.img} alt="" className="h-4 w-4 rounded bg-pf-bg-dark" />}
          <span className="max-w-[16ch] truncate">{pick.match.name}</span>
        </>
      );
    case 'skill-increase':
      return (
        <span className="max-w-[20ch] truncate">
          {capitaliseSkillSlug(pick.skill)}
          <span className="ml-1 text-pf-primary">→ {SKILL_RANK_SHORT[pick.newRank]}</span>
        </span>
      );
    case 'ability-boosts':
      return <span className="max-w-[20ch] truncate">{pick.abilities.map((a) => a.toUpperCase()).join(' · ')}</span>;
  }
}

function renderPickTitle(slot: SlotType, pick: Pick): string {
  switch (pick.kind) {
    case 'feat':
      return `${SLOT_LABEL[slot]}: ${pick.match.name}`;
    case 'skill-increase':
      return `${SLOT_LABEL[slot]}: ${capitaliseSkillSlug(pick.skill)} → ${SKILL_RANK_SHORT[pick.newRank]}`;
    case 'ability-boosts':
      return `${SLOT_LABEL[slot]}: +1 ${pick.abilities.map((a) => a.toUpperCase()).join(', ')}`;
  }
}

const SKILL_RANK_SHORT: Record<ProficiencyRank, string> = {
  0: 'U',
  1: 'T',
  2: 'E',
  3: 'M',
  4: 'L',
};

function capitaliseSkillSlug(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ─── Helpers ───────────────────────────────────────────────────────────

// Map a Progression slot type to the pf2e `<category>-<level>` location
// string written into `feat.system.location`. Returns null for slot types
// that don't use a location tag (none currently, but guards future slots).
const FEAT_SLOT_LOCATION_PREFIX: Partial<Record<SlotType, string>> = {
  'class-feat': 'class',
  'ancestry-feat': 'ancestry',
  'skill-feat': 'skill',
  'general-feat': 'general',
};

function featSlotLocationFor(slot: SlotType, level: number): string | null {
  const prefix = FEAT_SLOT_LOCATION_PREFIX[slot];
  return prefix !== undefined ? `${prefix}-${level.toString()}` : null;
}

// Reverse of slotKey — used by the auto-apply logic to recover the level
// and slot type from a stored Map key without keeping them separately.
function parseSlotKey(key: SlotKey): { level: number; slot: SlotType } | null {
  const sep = key.indexOf(':');
  if (sep === -1) return null;
  const level = Number(key.slice(0, sep));
  if (!Number.isFinite(level)) return null;
  return { level, slot: key.slice(sep + 1) as SlotType };
}

// Serialise all non-feat picks into the Foundry actor flag shape. Written to
// flags['player-portal']['progression-picks'] so picks survive page refreshes.
function buildProgressionPicksFlags(picks: Map<SlotKey, Pick>): Record<string, Record<string, unknown>> {
  const blob: Record<string, unknown> = {};
  for (const [key, pick] of picks) {
    if (pick.kind !== 'feat') blob[key] = pick;
  }
  return { 'player-portal': { 'progression-picks': blob } };
}

// Deserialise one entry from the stored flag blob back into a typed Pick.
// Returns null for any shape that doesn't match a known non-feat kind.
function parsePersistedPick(raw: unknown): Exclude<Pick, { kind: 'feat' }> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === 'skill-increase') {
    if (typeof obj.skill !== 'string') return null;
    const rank = obj.newRank;
    if (typeof rank !== 'number' || rank < 0 || rank > 4) return null;
    return { kind: 'skill-increase', skill: obj.skill, newRank: rank as ProficiencyRank };
  }
  if (obj.kind === 'ability-boosts') {
    if (!Array.isArray(obj.abilities)) return null;
    const abilities = (obj.abilities as unknown[]).filter(
      (a): a is AbilityKey => typeof a === 'string' && (ABILITY_KEYS as readonly string[]).includes(a),
    );
    return { kind: 'ability-boosts', abilities };
  }
  return null;
}

function groupFeaturesByLevel(items: ClassItem['system']['items']): Map<number, ClassFeatureEntry[]> {
  const out = new Map<number, ClassFeatureEntry[]>();
  for (const entry of Object.values(items)) {
    const arr = out.get(entry.level) ?? [];
    arr.push(entry);
    out.set(entry.level, arr);
  }
  for (const [, arr] of out) arr.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Parse pf2e's `<category>-<level>` slot location strings into the
// Progression tab's slot taxonomy. Returns null for anything we
// don't model (archetype-N, etc. — pf2e archetype feats live
// outside the stock level chassis).
function parseFeatLocation(location: string): { slot: SlotType; level: number } | null {
  const match = /^(ancestry|class|skill|general)-(\d+)$/.exec(location);
  if (!match) return null;
  const level = Number(match[2]);
  if (!Number.isFinite(level) || level < 1) return null;
  const prefix = match[1] as 'ancestry' | 'class' | 'skill' | 'general';
  return { slot: `${prefix}-feat`, level };
}

function buildLevelSlotMap(sys: ClassItem['system']): Map<number, readonly SlotType[]> {
  // Render order for slots on a given level. Class feats come first because
  // they're the most character-defining; ability boosts last because they
  // collapse into a single "4 boosts" chip.
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

// Wraps CompendiumPicker with the creator's prereq + sort + source-filter
// behavior. Keying on level+slot remounts this on each open so picker
// state resets per slot.
// `Pick` is shadowed by the local progression-pick discriminated-union
// type, so we use the global helper via this alias to work around the
// scoping collision. (Putting this at module scope captures the
// built-in Pick before the local declaration.)
type _CreatorFilters = {
  [K in
    | 'packIds'
    | 'documentType'
    | 'traits'
    | 'anyTraits'
    | 'maxLevel'
    | 'ancestrySlug']?: CompendiumSearchOptions[K];
};

function ProgressionPicker({
  title,
  filters,
  characterContext,
  onPick,
  onClose,
}: {
  title: string;
  filters: _CreatorFilters;
  characterContext: CharacterContext;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}): React.ReactElement {
  const props = useCreatorPickerProps(filters, characterContext, onPick);
  return (
    <CompendiumPicker
      title={title}
      {...props}
      onClose={onClose}
      testId="feat-picker"
      resultsTestId="feat-picker-results"
      loadMoreTestId="feat-picker-load-more"
    />
  );
}
