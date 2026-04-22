import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import type {
  AbilityKey,
  ClassFeatureEntry,
  ClassItem,
  CompendiumDocument,
  CompendiumMatch,
  PreparedActorItem,
  ProficiencyRank,
} from '../../api/types';
import { isClassItem } from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { useUuidHover } from '../../lib/useUuidHover';
import type { CharacterContext } from '../../prereqs';
import { SectionHeader } from '../common/SectionHeader';
import { AbilityBoostPicker } from '../creator/AbilityBoostPicker';
import { FeatPicker } from '../creator/FeatPicker';
import { SkillIncreasePicker } from '../creator/SkillIncreasePicker';

// All picks share the same map keyed by `${level}:${slot}`. The value
// is a discriminated union so each slot kind can store the shape it
// needs to reconstruct its chip / later feed into the scratch-actor.
type Pick =
  | { kind: 'feat'; match: CompendiumMatch }
  | { kind: 'skill-increase'; skill: string; newRank: ProficiencyRank }
  | { kind: 'ability-boosts'; abilities: AbilityKey[] };

interface Props {
  characterLevel: number;
  items: PreparedActorItem[];
  characterContext: CharacterContext;
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
// Class-feat slots are clickable — they open a compendium-search modal
// (FeatPicker) scoped to the character's class trait and capped at the
// slot's level. Picks are held in local state for now; the scratch-actor
// mutation flow comes later.
export function Progression({ characterLevel, items, characterContext }: Props): React.ReactElement {
  const classItem = items.find(isClassItem);
  const [picks, setPicks] = useState<Map<SlotKey, Pick>>(new Map());
  const [pickerTarget, setPickerTarget] = useState<{ level: number; slot: SlotType } | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks(hydrated);
    // Only re-hydrate when the list of items itself changes identity —
    // in practice that's when the actor refetches, not on every
    // internal picks mutation.
  }, [items]);

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
    const queue = all.filter((f) => !cache.has(f.uuid));
    const CONCURRENCY = 4;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0 && !cancelled) {
        const entry = queue.shift();
        if (!entry) break;
        if (cache.has(entry.uuid)) continue;
        try {
          const result = await api.getCompendiumDocument(entry.uuid);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled toggles asynchronously in cleanup
          if (cancelled) return;
          cache.set(entry.uuid, result.document);
          errors.delete(entry.uuid);
          setDocsVersion((v) => v + 1);
        } catch (err) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled toggles asynchronously in cleanup
          if (cancelled) return;
          // Record the miss so the popover can show "couldn't load"
          // instead of a forever-spinning "Loading…".
          errors.add(entry.uuid);
          setDocsVersion((v) => v + 1);

          console.warn('Failed to prefetch class feature', entry.uuid, err);
        }
      }
    });
    void Promise.all(workers);
    return (): void => {
      cancelled = true;
    };
  }, [classItem]);

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
    const key = slotKey(pickerTarget.level, pickerTarget.slot);
    setPicks((prev) => {
      const next = new Map(prev);
      next.set(key, pick);
      return next;
    });
    setPickerTarget(null);
  };
  const clearPick = (level: number, slot: SlotType): void => {
    setPicks((prev) => {
      const next = new Map(prev);
      next.delete(slotKey(level, slot));
      return next;
    });
  };

  const pickerFilters = pickerTarget
    ? buildPickerFilters(pickerTarget.slot, pickerTarget.level, classTrait, ancestryTrait)
    : null;

  return (
    <section className="space-y-4" data-section="progression">
      <div>
        <SectionHeader>{classItem.name} Progression</SectionHeader>
        <p className="mb-3 text-xs text-pf-alt">
          Class features auto-granted at each level, plus the feat and skill slots the rules open. Click a feat chip to
          pick one; selections are held in memory until the scratch-actor flow lands.
        </p>
      </div>
      <ol className="space-y-1.5">
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
      {pickerTarget && pickerFilters && (
        <FeatPicker
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
        'grid grid-cols-[3rem_1fr] items-start gap-3 rounded border px-3 py-2',
        state === 'current' ? 'border-pf-primary bg-pf-tertiary/30' : 'border-pf-border bg-white',
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

// Popover width is load-bearing for viewport clamping, so it's a
// constant the CSS (`w-[...]px`) and the JS positioning both read.
const FEATURE_POPOVER_WIDTH = 420;
const FEATURE_POPOVER_GAP = 6;
// Tiny delay before closing on mouseleave gives the cursor time to
// bridge from chip → popover without the popover winking out.
const HOVER_CLOSE_DELAY_MS = 120;
// Open delay filters out incidental mouseovers while the cursor
// passes across the chip row.
const HOVER_OPEN_DELAY_MS = 300;

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
    }, HOVER_CLOSE_DELAY_MS);
  };
  const scheduleOpen = (): void => {
    cancelClose();
    if (open) return;
    cancelOpen();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      if (!chipRef.current) return;
      const rect = chipRef.current.getBoundingClientRect();
      // Keep the popover inside the viewport — shift left if it'd overflow
      // the right edge, and snap a minimum margin on the left.
      const maxLeft = window.innerWidth - FEATURE_POPOVER_WIDTH - 12;
      const left = Math.max(12, Math.min(rect.left, maxLeft));
      setPos({ top: rect.bottom + FEATURE_POPOVER_GAP, left });
      setOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current !== null) clearTimeout(openTimerRef.current);
    },
    [],
  );

  const description = doc ? extractDescription(doc) : undefined;
  return (
    <li
      ref={chipRef}
      className="inline-flex items-center gap-1.5 rounded border border-pf-border bg-white px-1.5 py-0.5 text-xs text-pf-text"
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
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: FEATURE_POPOVER_WIDTH }}
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
                className="max-h-[28rem] overflow-y-auto pr-1 text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2 [&_p]:leading-relaxed"
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

function extractDescription(doc: CompendiumDocument): string {
  const sys = doc.system as { description?: { value?: unknown } };
  const raw = sys.description?.value;
  return typeof raw === 'string' ? raw : '';
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
  return (
    <span
      data-pick-uuid={pick.kind === 'feat' ? pick.match.uuid : undefined}
      className="inline-flex items-center gap-1 rounded border border-pf-border bg-white pl-1 pr-0.5 text-[11px] text-pf-text"
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
