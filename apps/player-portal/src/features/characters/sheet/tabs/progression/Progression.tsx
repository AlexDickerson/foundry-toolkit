import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isClassItem, isFeatItem } from '@/features/characters/types';
import type {
  AbilityKey,
  ClassFeatureEntry,
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
import { buildLevelSlotMap, groupFeaturesByLevel, slotKey, type SlotKey, type SlotType } from './slot';
import type { Pick } from './picks';
import { useProgressionPicks } from './useProgressionPicks';

interface Props {
  actorId: string;
  characterLevel: number;
  items: PreparedActorItem[];
  characterContext: CharacterContext;
  onActorChanged: () => void;
  /** Deserialised from `actor.flags['player-portal']['progression-picks']`.
   *  Hydrates skill-increase and ability-boost picks across page refreshes. */
  persistedPicks?: Record<string, unknown>;
}

// Levels every character can reach (pf2e core: 1-20).
const LEVELS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

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
// useCreatorPickerProps). Picks for current/past levels write to Foundry
// immediately; picks for future levels are stored in flags only and
// auto-applied when the character reaches that level. The pick state
// machine + Foundry write orchestration lives in useProgressionPicks;
// this component is the timeline rendering + UI state (which slot the
// picker is currently targeting).
export function Progression({
  actorId,
  characterLevel,
  items,
  characterContext,
  onActorChanged,
  persistedPicks,
}: Props): React.ReactElement {
  const classItem = items.find(isClassItem);
  const [pickerTarget, setPickerTarget] = useState<{ level: number; slot: SlotType } | null>(null);
  const { picks, commitPick, clearPick } = useProgressionPicks({
    actorId,
    items,
    characterLevel,
    ...(persistedPicks !== undefined ? { persistedPicks } : {}),
    onActorChanged,
  });

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
  const featItemById = useMemo(() => {
    const map = new Map<string, PreparedActorItem>();
    for (const item of items) {
      if (isFeatItem(item)) map.set(item.id, item);
    }
    return map;
  }, [items]);
  const resolveLocalPickDoc = useCallback(
    (uuid: string): CompendiumDocument | undefined => {
      const item = featItemById.get(uuid);
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
    [featItemById],
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
  // Bridge from picker callbacks → the hook's state machine. The picker
  // already knows the slot it's targeting (via `pickerTarget`), so the
  // component owns the "which slot are we picking for" UI state and the
  // hook owns the "what does committing mean for this kind" logic.
  const onPick = (pick: Pick): void => {
    if (!pickerTarget) return;
    commitPick(pickerTarget.level, pickerTarget.slot, pick);
    setPickerTarget(null);
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
            onPick({ kind: 'feat', match });
          }}
          onClose={closePicker}
        />
      )}
      {pickerTarget?.slot === 'skill-increase' && (
        <SkillIncreasePicker
          level={pickerTarget.level}
          characterContext={characterContext}
          onPick={(skill, newRank): void => {
            onPick({ kind: 'skill-increase', skill, newRank });
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
              onPick({ kind: 'ability-boosts', abilities });
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

// Wraps CompendiumPicker with the creator's prereq + sort + source-filter
// behavior. Keying on level+slot remounts this on each open so picker
// state resets per slot.
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
