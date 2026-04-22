import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AbilityKey, CompendiumMatch, CompendiumSearchOptions } from '../api/types';
import { ABILITY_KEYS } from '../api/types';
import { BoostedMod } from '../components/creator/AbilityBoostPicker';
import { FeatPicker } from '../components/creator/FeatPicker';
import { PromptModal } from '../components/creator/PromptModal';
import { usePendingPrompts } from '../lib/usePendingPrompts';
import { useUuidHover } from '../lib/useUuidHover';

// Module-scoped so React 18 StrictMode's dev-only double-mount
// doesn't spawn two actor-create requests. First mount creates the
// promise, second mount reuses it. Reset to null when the user
// actually leaves the wizard (back or finish), so the next session
// allocates a fresh draft actor.
let pendingActorPromise: Promise<string> | null = null;
function beginOrReusePendingActor(): Promise<string> {
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
function resetPendingActor(): void {
  pendingActorPromise = null;
}

// Character creation wizard — Phase 1: identity + core choices.
// Opening the wizard creates a blank actor in Foundry and the wizard
// patches it piecemeal as steps are filled. Text fields flush on
// step-advance; picks sync immediately (add the compendium item,
// delete the previous pick for that slot). "Finish" lands the user
// on the live sheet view for further allocation.

type Step = 'identity' | 'ancestry' | 'class' | 'background' | 'attributes' | 'skills' | 'languages' | 'review';

// Picker targets are decoupled from wizard steps: heritage selection
// lives inside the ancestry step rather than owning a step of its own
// (heritages are always children of an ancestry in pf2e's data), and
// deity selection lives inside the identity step.
type PickerTarget = 'ancestry' | 'heritage' | 'class' | 'background' | 'deity' | 'class-feat' | 'ancestry-feat';

interface Slot {
  match: CompendiumMatch;
  // Item id on the persisted actor. Saved so we can delete the old
  // item when the user changes their pick for this slot.
  itemId: string;
}

interface Draft {
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

const EMPTY_DRAFT: Draft = {
  name: '',
  gender: '',
  age: '',
  ethnicity: '',
  nationality: '',
  deity: null,
  ancestry: null,
  ancestrySlug: null,
  heritage: null,
  heritageSlug: null,
  class: null,
  classSlug: null,
  background: null,
  classFeat: null,
  ancestryFeat: null,
  levelOneBoosts: [],
  ancestryBoosts: [],
  backgroundBoosts: [],
  classKeyAbility: null,
  skillPicks: [],
  languagePicks: [],
  classGrantsL1Feat: null,
  languageAllowance: null,
};

const STEPS: readonly Step[] = [
  'identity',
  'ancestry',
  'class',
  'background',
  'attributes',
  'skills',
  'languages',
  'review',
];

const STEP_LABEL: Record<Step, string> = {
  identity: 'Identity',
  ancestry: 'Ancestry',
  class: 'Class',
  background: 'Background',
  attributes: 'Attributes',
  skills: 'Skills',
  languages: 'Languages',
  review: 'Review',
};

const PICKER_LABEL: Record<PickerTarget, string> = {
  ancestry: 'Ancestry',
  heritage: 'Heritage',
  class: 'Class',
  background: 'Background',
  deity: 'Deity',
  'class-feat': 'Class Feat',
  'ancestry-feat': 'Ancestry Feat',
};

type PickerFilters = Pick<
  CompendiumSearchOptions,
  'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'ancestrySlug' | 'maxLevel'
>;

const STATIC_PICKER_FILTERS: Record<
  Exclude<PickerTarget, 'heritage' | 'class-feat' | 'ancestry-feat'>,
  PickerFilters
> = {
  ancestry: { packIds: ['pf2e.ancestries'], documentType: 'Item' },
  class: { packIds: ['pf2e.classes'], documentType: 'Item' },
  background: { packIds: ['pf2e.backgrounds'], documentType: 'Item' },
  deity: { packIds: ['pf2e.deities'], documentType: 'Item' },
};

interface Props {
  onBack: () => void;
  onFinish: (actorId: string) => void;
}

// Actor lifecycle: wizard opens → creating → ready (actor exists in
// Foundry, piecemeal patches flow through). Failed creation blocks
// the UI with a retry button.
type CreatorState = { kind: 'creating' } | { kind: 'ready'; actorId: string } | { kind: 'error'; message: string };

export function CharacterCreator({ onBack, onFinish }: Props): React.ReactElement {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [openPicker, setOpenPicker] = useState<PickerTarget | null>(null);
  const [creator, setCreator] = useState<CreatorState>({ kind: 'creating' });
  const pendingPrompts = usePendingPrompts();
  const activePrompt = pendingPrompts[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    beginOrReusePendingActor()
      .then((actorId) => {
        if (cancelled) return;
        setCreator({ kind: 'ready', actorId });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setCreator({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const actorId = creator.kind === 'ready' ? creator.actorId : null;

  // Debounced flush of the identity text fields. Previously this ran
  // on step-advance; the single-page layout has no natural gate, so
  // we buffer typing for ~500ms then PATCH. Picks flush eagerly on
  // their own click handlers regardless.
  useEffect(() => {
    if (actorId === null) return;
    const timeout = window.setTimeout(() => {
      void api
        .updateActor(actorId, {
          name: draft.name.trim().length > 0 ? draft.name : 'New Character',
          system: {
            details: {
              gender: draft.gender,
              age: draft.age,
              ethnicity: draft.ethnicity,
              nationality: draft.nationality,
            },
          },
        })
        .catch((err: unknown) => {
          console.warn('Failed to flush identity fields', err);
        });
    }, 500);
    return (): void => {
      clearTimeout(timeout);
    };
  }, [actorId, draft.name, draft.gender, draft.age, draft.ethnicity, draft.nationality]);

  const jumpToSection = (id: Step): void => {
    const el = document.getElementById(`creator-section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFinish = (): void => {
    if (actorId === null) return;
    resetPendingActor();
    onFinish(actorId);
  };

  const applyPick = (match: CompendiumMatch): void => {
    const target = openPicker;
    if (target === null || actorId === null) return;
    setOpenPicker(null);
    // Picks sync eagerly: add the new compendium item, then delete the
    // previous pick for this slot (if any) once the add succeeds. The
    // draft only updates on the response so a failed add leaves state
    // consistent with the actor in Foundry.
    void persistPick(actorId, target, match, draft)
      .then((slot) => {
        setDraft((d) => applyPickedSlot(d, target, slot));
      })
      .catch((err: unknown) => {
        // Surface the failure as a soft error on the creator state so
        // the user can retry. Draft is untouched.
        const message = err instanceof Error ? err.message : String(err);
        setCreator({ kind: 'error', message: `Couldn't apply ${target}: ${message}` });
      });
  };

  // Resolve the ancestry's slug from its full document so the heritage
  // picker can scope its search. pf2e doesn't expose slug in the
  // compendium index by default, so we pay one extra fetch per
  // ancestry pick.
  useEffect(() => {
    const ancestry = draft.ancestry;
    if (ancestry === null || draft.ancestrySlug !== null) return;
    let cancelled = false;
    void api
      .getCompendiumDocument(ancestry.match.uuid)
      .then((res) => {
        if (cancelled) return;
        const sys = res.document.system as { slug?: unknown };
        const slug = typeof sys.slug === 'string' ? sys.slug : null;
        setDraft((d) => (d.ancestry === ancestry ? { ...d, ancestrySlug: slug } : d));
      })
      .catch(() => {
        // Swallow — falling back to unfiltered heritages is acceptable.
      });
    return (): void => {
      cancelled = true;
    };
  }, [draft.ancestry, draft.ancestrySlug]);

  // Same dance for heritage — the ancestry-feat picker pools the
  // heritage's slug into `anyTraits` so versatile-heritage feats
  // (changeling, aiuvarin, etc.) show up alongside the parent
  // ancestry's feats.
  useEffect(() => {
    const heritage = draft.heritage;
    if (heritage === null || draft.heritageSlug !== null) return;
    let cancelled = false;
    void api
      .getCompendiumDocument(heritage.match.uuid)
      .then((res) => {
        if (cancelled) return;
        const sys = res.document.system as { slug?: unknown };
        const slug = typeof sys.slug === 'string' ? sys.slug : null;
        setDraft((d) => (d.heritage === heritage ? { ...d, heritageSlug: slug } : d));
      })
      .catch(() => {
        /* ignore — picker falls back to just the ancestry trait */
      });
    return (): void => {
      cancelled = true;
    };
  }, [draft.heritage, draft.heritageSlug]);

  // Same dance for the class slug — drives the class-feat picker's
  // trait filter. pf2e tags class feats with the class slug (e.g.
  // ['alchemist', 'additive']); the slug isn't in the compendium
  // index so we fetch the doc once per class pick.
  useEffect(() => {
    const cls = draft.class;
    if (cls === null || draft.classSlug !== null) return;
    let cancelled = false;
    void api
      .getCompendiumDocument(cls.match.uuid)
      .then((res) => {
        if (cancelled) return;
        const sys = res.document.system as { slug?: unknown };
        const slug = typeof sys.slug === 'string' ? sys.slug : null;
        setDraft((d) => (d.class === cls ? { ...d, classSlug: slug } : d));
      })
      .catch(() => {
        /* ignore — class-feat picker falls back to unfiltered */
      });
    return (): void => {
      cancelled = true;
    };
  }, [draft.class, draft.classSlug]);

  const pickerFilters = openPicker !== null ? filtersForTarget(openPicker, draft) : undefined;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={(): void => {
            // Null the module-scope cache so re-entering the wizard
            // allocates a fresh draft actor instead of reusing the
            // one the user is stepping away from.
            resetPendingActor();
            onBack();
          }}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          ← Actors
        </button>
        <h1 className="font-serif text-2xl font-semibold text-pf-text">New Character</h1>
      </div>

      {creator.kind === 'creating' && (
        <p className="rounded border border-pf-border bg-white p-4 text-sm italic text-pf-alt-dark">
          Creating draft actor…
        </p>
      )}
      {creator.kind === 'error' && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-900">Couldn&apos;t create the draft actor</p>
          <p className="mt-1 text-red-800">{creator.message}</p>
        </div>
      )}

      {creator.kind === 'ready' && (
        <>
          {/* Sticky anchor nav — clicking a pill scrolls the matching
              section into view. Filled state still derives from
              `isStepFilled` so users can see what's outstanding. */}
          <div className="sticky top-0 z-10 -mx-1 mb-4 bg-gradient-to-b from-white via-white/95 to-transparent px-1 pb-2 pt-2">
            <StepNav steps={STEPS} active={null} onJump={jumpToSection} draft={draft} />
          </div>

          <CreatorSection id="identity" title="Identity">
            <IdentityStep
              draft={draft}
              onChange={(patch): void => {
                setDraft((d) => ({ ...d, ...patch }));
              }}
              onPickDeity={(): void => {
                setOpenPicker('deity');
              }}
            />
          </CreatorSection>

          <CreatorSection id="ancestry" title="Ancestry & Heritage">
            <AncestryStep
              ancestry={draft.ancestry?.match ?? null}
              heritage={draft.heritage?.match ?? null}
              ancestryFeat={draft.ancestryFeat?.match ?? null}
              ancestrySlugResolved={draft.ancestrySlug !== null}
              onPickAncestry={(): void => {
                setOpenPicker('ancestry');
              }}
              onPickHeritage={(): void => {
                setOpenPicker('heritage');
              }}
              onPickAncestryFeat={(): void => {
                setOpenPicker('ancestry-feat');
              }}
            />
          </CreatorSection>

          <CreatorSection id="class" title="Class">
            <ClassStep
              classPick={draft.class?.match ?? null}
              classFeat={draft.classFeat?.match ?? null}
              classSlugResolved={draft.classSlug !== null}
              onPickClass={(): void => {
                setOpenPicker('class');
              }}
              onPickClassFeat={(): void => {
                setOpenPicker('class-feat');
              }}
              onL1FeatAvailability={(grants): void => {
                setDraft((d) => (d.classGrantsL1Feat === grants ? d : { ...d, classGrantsL1Feat: grants }));
              }}
            />
          </CreatorSection>

          <CreatorSection id="background" title="Background">
            <PickerCard
              label="Background"
              selection={draft.background?.match ?? null}
              onOpen={(): void => {
                setOpenPicker('background');
              }}
            />
          </CreatorSection>

          <CreatorSection id="attributes" title="Attributes">
            <AttributesStep
              actorId={actorId}
              ancestryPick={draft.ancestry?.match ?? null}
              ancestryItemId={draft.ancestry?.itemId ?? null}
              backgroundPick={draft.background?.match ?? null}
              backgroundItemId={draft.background?.itemId ?? null}
              classPick={draft.class?.match ?? null}
              classItemId={draft.class?.itemId ?? null}
              levelOneBoosts={draft.levelOneBoosts}
              ancestryBoosts={draft.ancestryBoosts}
              backgroundBoosts={draft.backgroundBoosts}
              classKeyAbility={draft.classKeyAbility}
              onDraftPatch={(patch): void => {
                setDraft((d) => ({ ...d, ...patch }));
              }}
            />
          </CreatorSection>

          <CreatorSection id="skills" title="Skills">
            <SkillsStep
              actorId={actorId}
              backgroundPick={draft.background?.match ?? null}
              classPick={draft.class?.match ?? null}
              classItemId={draft.class?.itemId ?? null}
              skillPicks={draft.skillPicks}
              intMod={computeIntMod(draft)}
              onDraftPatch={(patch): void => {
                setDraft((d) => ({ ...d, ...patch }));
              }}
            />
          </CreatorSection>

          <CreatorSection id="languages" title="Languages">
            <LanguagesStep
              actorId={actorId}
              ancestryPick={draft.ancestry?.match ?? null}
              languagePicks={draft.languagePicks}
              intMod={computeIntMod(draft)}
              onDraftPatch={(patch): void => {
                setDraft((d) => ({ ...d, ...patch }));
              }}
              onAllowanceResolved={(n): void => {
                setDraft((d) => (d.languageAllowance === n ? d : { ...d, languageAllowance: n }));
              }}
            />
          </CreatorSection>

          <CreatorSection id="review" title="Review">
            <ReviewStep draft={draft} />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleFinish}
                disabled={actorId === null}
                className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark disabled:opacity-40"
              >
                Open sheet →
              </button>
            </div>
          </CreatorSection>

          {openPicker !== null && pickerFilters !== undefined && (
            <FeatPicker
              title={`Choose a ${PICKER_LABEL[openPicker]}`}
              filters={pickerFilters}
              onPick={applyPick}
              onClose={(): void => {
                setOpenPicker(null);
              }}
            />
          )}
        </>
      )}

      {/* Module-driven prompts (pf2e ChoiceSets) render on top of
          everything else so the wizard pauses until the user picks. */}
      {activePrompt !== null && <PromptModal prompt={activePrompt} />}
    </div>
  );
}

// ─── Step components ───────────────────────────────────────────────────

function StepNav({
  steps,
  active,
  onJump,
  draft,
}: {
  steps: readonly Step[];
  // `active` is nullable now that the creator is single-page — the
  // nav no longer tracks a current step, it just surfaces which
  // sections have something filled in so the user can see progress.
  active: Step | null;
  onJump: (s: Step) => void;
  draft: Draft;
}): React.ReactElement {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px] uppercase tracking-widest text-pf-alt-dark">
      {steps.map((s, idx) => {
        const isActive = s === active;
        const filled = isStepFilled(s, draft);
        return (
          <li key={s} className="contents">
            <button
              type="button"
              onClick={(): void => {
                onJump(s);
              }}
              data-step={s}
              aria-current={isActive ? 'step' : undefined}
              className={[
                'rounded border px-2 py-1 transition-colors',
                isActive
                  ? 'border-pf-primary bg-pf-primary text-white'
                  : filled
                    ? 'border-pf-border bg-pf-bg text-pf-text hover:bg-pf-bg-dark'
                    : 'border-pf-border bg-white text-pf-alt-dark hover:bg-pf-bg',
              ].join(' ')}
            >
              {STEP_LABEL[s]}
            </button>
            {idx < steps.length - 1 && <span className="px-1 text-pf-alt-dark">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

// Section shell used by the single-page creator layout. Each section
// gets an anchor id (so the StepNav pills can scroll to it) and a
// serif header matching the rest of the sheet. `scroll-mt` backs off
// the sticky nav so a jumped-to section doesn't hide under it.
function CreatorSection({
  id,
  title,
  children,
}: {
  id: Step;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      id={`creator-section-${id}`}
      data-creator-section={id}
      className="mb-6 scroll-mt-20 rounded border border-pf-border bg-white p-4"
    >
      <h2 className="mb-3 border-b border-pf-border pb-1 font-serif text-base font-semibold uppercase tracking-widest text-pf-alt-dark">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Identity text fields beyond name are free-form — pf2e stores them
// as arbitrary strings on `system.details` and the sheet renders them
// verbatim. Deity is the one exception; it has to land in the picker
// because pf2e keys deity by compendium uuid for clergy/cleric gates
// later on.
type IdentityTextField = 'name' | 'gender' | 'age' | 'ethnicity' | 'nationality';

function IdentityStep({
  draft,
  onChange,
  onPickDeity,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onPickDeity: () => void;
}): React.ReactElement {
  const textFields: Array<{
    key: IdentityTextField;
    label: string;
    placeholder: string;
    autoFocus?: boolean;
    fullWidth?: boolean;
  }> = [
    { key: 'name', label: 'Name', placeholder: 'e.g. Lutharion Saverin', autoFocus: true, fullWidth: true },
    { key: 'gender', label: 'Gender / Pronouns', placeholder: 'e.g. she/her, non-binary' },
    { key: 'age', label: 'Age', placeholder: 'e.g. 31' },
    { key: 'ethnicity', label: 'Ethnicity', placeholder: 'e.g. Taldan' },
    { key: 'nationality', label: 'Nationality', placeholder: 'e.g. Andoran' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {textFields.map(({ key, label, placeholder, autoFocus, fullWidth }) => (
          <label
            key={key}
            className={[
              'block text-xs font-semibold uppercase tracking-widest text-pf-alt-dark',
              fullWidth === true ? 'sm:col-span-2' : '',
            ].join(' ')}
          >
            {label}
            <input
              id={`creator-${key}`}
              type="text"
              value={draft[key]}
              onChange={(e): void => {
                onChange({ [key]: e.target.value } as Partial<Draft>);
              }}
              autoFocus={autoFocus}
              placeholder={placeholder}
              className="mt-1 w-full rounded border border-pf-border bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-pf-text focus:border-pf-primary focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="border-t border-pf-border pt-4" data-creator-subpicker="deity">
        <PickerCard label="Deity" selection={draft.deity?.match ?? null} onOpen={onPickDeity} />
      </div>
    </div>
  );
}

// After a class is picked we surface the auto-granted L1 features
// pulled off `class.system.items` — the pf2e class chassis lists
// each feature with its `{uuid, name, img, level}` and pf2e grants
// everything `level <= characterLevel` when the class item is
// attached. At creation we're always at level 1, so filter to that.
// The list is read-only for now; the Progression tab handles the
// per-level allocations once persistence is in place.
interface ClassFeatureEntry {
  uuid: string;
  name: string;
  img: string;
  level: number;
}

type ClassDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | {
      kind: 'ready';
      uuid: string;
      features: ClassFeatureEntry[];
      // pf2e's class chassis declares which levels grant a class
      // feat; we use this to decide whether the L1 class-feat slot
      // is valid (Wizard, Cleric, etc. don't grant L1 class feats).
      grantsL1ClassFeat: boolean;
    }
  | { kind: 'error'; uuid: string; message: string };

function ClassStep({
  classPick,
  classFeat,
  classSlugResolved,
  onPickClass,
  onPickClassFeat,
  onL1FeatAvailability,
}: {
  classPick: CompendiumMatch | null;
  classFeat: CompendiumMatch | null;
  classSlugResolved: boolean;
  onPickClass: () => void;
  onPickClassFeat: () => void;
  // Bubbles the `classFeatLevels.value.includes(1)` result up to the
  // parent once the class doc resolves, so the Review section can
  // distinguish "slot vacant" from "class never granted a slot" for
  // classes like Wizard or Cleric.
  onL1FeatAvailability: (grants: boolean) => void;
}): React.ReactElement {
  const [docState, setDocState] = useState<ClassDocState>({ kind: 'idle' });
  // Hover previews on the feature chips reuse the same stack-based
  // popover plumbing as the rest of the app. Delegation handlers go
  // on the features container; `data-uuid` on each chip triggers the
  // fetch.
  const uuidHover = useUuidHover();

  useEffect(() => {
    if (classPick === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocState({ kind: 'idle' });
      return;
    }
    const uuid = classPick.uuid;

    setDocState({ kind: 'loading', uuid });
    let cancelled = false;
    void api
      .getCompendiumDocument(uuid)
      .then((res) => {
        if (cancelled) return;
        const features = extractLevel1Features(res.document.system);
        const grantsL1ClassFeat = extractGrantsL1ClassFeat(res.document.system);
        setDocState({ kind: 'ready', uuid, features, grantsL1ClassFeat });
        onL1FeatAvailability(grantsL1ClassFeat);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setDocState({ kind: 'error', uuid, message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [classPick]);

  return (
    <div className="space-y-4">
      <PickerCard label="Class" selection={classPick} onOpen={onPickClass} />
      {classPick !== null && (
        <div
          className="space-y-4 border-t border-pf-border pt-4"
          onMouseOver={uuidHover.delegationHandlers.onMouseOver}
          onMouseOut={uuidHover.delegationHandlers.onMouseOut}
        >
          <div data-creator-subsection="class-features">
            <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
              Level 1 Features
            </h3>
            <ClassFeaturesList state={docState} />
          </div>
          {docState.kind === 'ready' && docState.grantsL1ClassFeat && (
            <div data-creator-subsection="class-feat">
              <FeatSlot
                label="Level 1 Class Feat"
                selection={classFeat}
                disabled={!classSlugResolved}
                onOpen={onPickClassFeat}
                {...(classSlugResolved ? {} : { disabledHint: 'Resolving class…' })}
              />
            </div>
          )}
          {docState.kind === 'ready' && !docState.grantsL1ClassFeat && (
            <p className="text-xs italic text-pf-alt-dark" data-creator-subsection="class-feat-skip">
              This class doesn&apos;t grant a class feat at level 1.
            </p>
          )}
          {uuidHover.popover}
        </div>
      )}
    </div>
  );
}

// Compact feat-slot chip for the L1 class/ancestry feat picks on
// the class/ancestry steps. Smaller and less imposing than the
// full PickerCard used for ancestry/class/deity itself.
function FeatSlot({
  label,
  selection,
  disabled,
  disabledHint,
  onOpen,
}: {
  label: string;
  selection: CompendiumMatch | null;
  disabled?: boolean;
  disabledHint?: string;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2" data-feat-slot={label.toLowerCase().replace(/\s+/g, '-')}>
      <span className="w-36 shrink-0 font-serif text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
        {label}
      </span>
      {selection === null ? (
        <>
          <button
            type="button"
            onClick={onOpen}
            disabled={disabled === true}
            className="rounded border border-pf-border bg-white px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Choose
          </button>
          {disabled === true && disabledHint !== undefined && (
            <span className="text-xs italic text-pf-alt-dark">{disabledHint}</span>
          )}
        </>
      ) : (
        <>
          <span
            data-uuid={selection.uuid}
            className="inline-flex items-center gap-1.5 rounded border border-pf-border bg-white px-2 py-1 text-xs text-pf-text"
          >
            <img src={selection.img} alt="" className="h-4 w-4 rounded bg-pf-bg-dark" />
            <span className="truncate">{selection.name}</span>
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="rounded border border-pf-border bg-white px-2 py-1 text-[10px] uppercase tracking-widest text-pf-alt-dark hover:bg-pf-bg-dark"
          >
            Change
          </button>
        </>
      )}
    </div>
  );
}

function ClassFeaturesList({ state }: { state: ClassDocState }): React.ReactElement {
  if (state.kind === 'idle' || state.kind === 'loading') {
    return <p className="text-xs italic text-pf-alt">Loading features…</p>;
  }
  if (state.kind === 'error') {
    return <p className="text-xs text-pf-primary">Couldn&apos;t load class: {state.message}</p>;
  }
  if (state.features.length === 0) {
    return <p className="text-xs italic text-pf-alt">No auto-granted features at level 1.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" data-testid="class-l1-features">
      {state.features.map((f) => (
        <li
          key={f.uuid}
          data-uuid={f.uuid}
          className="inline-flex cursor-default items-center gap-1.5 rounded border border-pf-border bg-white px-2 py-1 text-xs text-pf-text"
        >
          <img src={f.img} alt="" className="h-4 w-4 rounded bg-pf-bg-dark" />
          <span className="truncate">{f.name}</span>
        </li>
      ))}
    </ul>
  );
}

function extractGrantsL1ClassFeat(system: unknown): boolean {
  const levels = (system as { classFeatLevels?: { value?: unknown } } | null)?.classFeatLevels?.value;
  return Array.isArray(levels) && levels.some((v) => v === 1);
}

function extractLevel1Features(system: unknown): ClassFeatureEntry[] {
  const items = (system as { items?: Record<string, unknown> } | null)?.items;
  if (items === undefined) return [];
  const out: ClassFeatureEntry[] = [];
  for (const raw of Object.values(items)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as { uuid?: unknown; name?: unknown; img?: unknown; level?: unknown };
    if (typeof entry.uuid !== 'string' || typeof entry.name !== 'string') continue;
    if (typeof entry.level !== 'number' || entry.level !== 1) continue;
    out.push({
      uuid: entry.uuid,
      name: entry.name,
      img: typeof entry.img === 'string' ? entry.img : '',
      level: entry.level,
    });
  }
  // Deterministic order: alphabetical so re-renders don't shuffle.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function AncestryStep({
  ancestry,
  heritage,
  ancestryFeat,
  ancestrySlugResolved,
  onPickAncestry,
  onPickHeritage,
  onPickAncestryFeat,
}: {
  ancestry: CompendiumMatch | null;
  heritage: CompendiumMatch | null;
  ancestryFeat: CompendiumMatch | null;
  ancestrySlugResolved: boolean;
  onPickAncestry: () => void;
  onPickHeritage: () => void;
  onPickAncestryFeat: () => void;
}): React.ReactElement {
  const uuidHover = useUuidHover();
  return (
    <div
      className="space-y-4"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <PickerCard label="Ancestry" selection={ancestry} onOpen={onPickAncestry} />
      {ancestry !== null && (
        <div className="space-y-3 border-t border-pf-border pt-4">
          <div data-creator-subpicker="heritage">
            <PickerCard
              label="Heritage"
              selection={heritage}
              onOpen={onPickHeritage}
              disabled={!ancestrySlugResolved}
              {...(ancestrySlugResolved ? {} : { disabledHint: 'Resolving ancestry…' })}
            />
          </div>
          <div data-creator-subsection="ancestry-feat">
            <FeatSlot
              label="Level 1 Ancestry Feat"
              selection={ancestryFeat}
              disabled={!ancestrySlugResolved}
              onOpen={onPickAncestryFeat}
              {...(ancestrySlugResolved ? {} : { disabledHint: 'Resolving ancestry…' })}
            />
          </div>
        </div>
      )}
      {uuidHover.popover}
    </div>
  );
}

function PickerCard({
  label,
  selection,
  onOpen,
  disabled,
  disabledHint,
}: {
  label: string;
  selection: CompendiumMatch | null;
  onOpen: () => void;
  disabled?: boolean;
  disabledHint?: string;
}): React.ReactElement {
  if (selection === null) {
    return (
      <div className="flex flex-col items-start gap-2" data-picker-card={label.toLowerCase()}>
        <p className="text-sm text-pf-text">No {label.toLowerCase()} selected yet.</p>
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled === true}
          className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Choose {label}
        </button>
        {disabled === true && disabledHint !== undefined && (
          <p className="text-xs italic text-pf-alt-dark">{disabledHint}</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3" data-picker-card={label.toLowerCase()}>
      {selection.img !== '' && (
        <img
          src={selection.img}
          alt=""
          className="h-14 w-14 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-semibold text-pf-text">{selection.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">
          {label}
          {selection.level !== undefined && ` · Level ${selection.level.toString()}`}
        </p>
        {selection.traits !== undefined && selection.traits.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {selection.traits.slice(0, 8).map((t) => (
              <li
                key={t}
                className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled === true}
        className="rounded border border-pf-border bg-white px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Change
      </button>
    </div>
  );
}

// Boost-slot shape normalised from pf2e's compendium data. Ancestry
// and background both store `system.boosts` as an indexed record of
// slots; class stores a single `system.keyAbility`. Each slot's
// `value` array is: one entry for fixed, 2+ entries for a
// constrained choice, all six (or empty) for a free pick.
type SlotKind = 'fixed' | 'free';
interface ParsedSlot {
  kind: SlotKind;
  options: AbilityKey[];
}
type SourceDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; uuid: string; slots: ParsedSlot[] }
  | { kind: 'error'; uuid: string; message: string };

function AttributesStep({
  actorId,
  ancestryPick,
  ancestryItemId,
  backgroundPick,
  backgroundItemId,
  classPick,
  classItemId,
  levelOneBoosts,
  ancestryBoosts,
  backgroundBoosts,
  classKeyAbility,
  onDraftPatch,
}: {
  actorId: string | null;
  ancestryPick: CompendiumMatch | null;
  ancestryItemId: string | null;
  backgroundPick: CompendiumMatch | null;
  backgroundItemId: string | null;
  classPick: CompendiumMatch | null;
  classItemId: string | null;
  levelOneBoosts: AbilityKey[];
  ancestryBoosts: (AbilityKey | null)[];
  backgroundBoosts: (AbilityKey | null)[];
  classKeyAbility: AbilityKey | null;
  onDraftPatch: (patch: Partial<Draft>) => void;
}): React.ReactElement {
  const ancestryDoc = useSourceSlots(ancestryPick, parseAncestryOrBackgroundSlots);
  // Flaws are parsed separately from the same ancestry doc — pf2e
  // applies them automatically when the item attaches, so we surface
  // them as read-only context inside the Ancestry section.
  const ancestryFlaws = useSourceSlots(ancestryPick, parseAncestryFlaws);
  const backgroundDoc = useSourceSlots(backgroundPick, parseAncestryOrBackgroundSlots);
  const classDoc = useSourceSlots(classPick, (sys) => {
    const slot = parseClassKeyAbility(sys);
    return slot !== null ? [slot] : [];
  });

  // Seed the draft picks once the docs arrive with fixed slots
  // pre-filled. Runs when the slot shape changes so switching
  // ancestry/class mid-step resets correctly.
  useEffect(() => {
    if (ancestryDoc.kind !== 'ready') return;
    if (ancestryBoosts.length === ancestryDoc.slots.length) return;
    onDraftPatch({ ancestryBoosts: seedPicks(ancestryDoc.slots) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestryDoc.kind === 'ready' ? ancestryDoc.uuid : null, ancestryDoc.kind]);
  useEffect(() => {
    if (backgroundDoc.kind !== 'ready') return;
    if (backgroundBoosts.length === backgroundDoc.slots.length) return;
    onDraftPatch({ backgroundBoosts: seedPicks(backgroundDoc.slots) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundDoc.kind === 'ready' ? backgroundDoc.uuid : null, backgroundDoc.kind]);
  useEffect(() => {
    if (classDoc.kind !== 'ready') return;
    if (classKeyAbility !== null) return;
    const first = classDoc.slots[0];
    if (first === undefined) return;
    if (first.kind === 'fixed' && first.options[0] !== undefined) {
      onDraftPatch({ classKeyAbility: first.options[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classDoc.kind === 'ready' ? classDoc.uuid : null, classDoc.kind]);

  // L1 free boosts live directly on the actor's build attributes —
  // pf2e's attribute builder writes them here, no per-item plumbing.
  const patchFreeBoosts = (next: AbilityKey[]): void => {
    if (actorId === null) return;
    void api
      .updateActor(actorId, {
        system: { build: { attributes: { boosts: { 1: next } } } },
      })
      .catch((err: unknown) => {
        console.warn('Failed to flush level-1 boosts', err);
      });
  };

  // Ancestry / background / class selections live on the embedded
  // items themselves (e.g. `ancestry.system.boosts.2.selected`).
  // pf2e derives `actor.system.build.attributes.boosts.*` from those
  // on actor prepare, so writing the actor path directly gets
  // overwritten next prep. We use dot-notation keys so Foundry's
  // deep-merge targets the exact nested field.
  const patchItem = (itemId: string | null, systemKey: string, value: unknown): void => {
    if (actorId === null || itemId === null) return;
    void api.updateActorItem(actorId, itemId, { system: { [systemKey]: value } }).catch((err: unknown) => {
      console.warn(`Failed to flush ${systemKey}`, err);
    });
  };

  const toggleFreeBoost = (key: AbilityKey): void => {
    let next: AbilityKey[];
    if (levelOneBoosts.includes(key)) {
      next = levelOneBoosts.filter((k) => k !== key);
    } else if (levelOneBoosts.length >= BOOSTS_REQUIRED) {
      return;
    } else {
      next = [...levelOneBoosts, key];
    }
    onDraftPatch({ levelOneBoosts: next });
    patchFreeBoosts(next);
  };

  const setAncestrySlot = (slotIdx: number, key: AbilityKey): void => {
    const next = [...ancestryBoosts];
    next[slotIdx] = key;
    onDraftPatch({ ancestryBoosts: next });
    patchItem(ancestryItemId, `boosts.${slotIdx.toString()}.selected`, key);
  };

  const setBackgroundSlot = (slotIdx: number, key: AbilityKey): void => {
    const next = [...backgroundBoosts];
    next[slotIdx] = key;
    onDraftPatch({ backgroundBoosts: next });
    patchItem(backgroundItemId, `boosts.${slotIdx.toString()}.selected`, key);
  };

  const setClassKeyAbility = (key: AbilityKey): void => {
    onDraftPatch({ classKeyAbility: key });
    patchItem(classItemId, 'keyAbility.selected', key);
  };

  return (
    <div className="space-y-5">
      <BoostSourceBlock
        label={ancestryPick !== null ? `Ancestry · ${ancestryPick.name}` : 'Ancestry'}
        state={ancestryDoc}
        placeholderText="Pick an ancestry on the previous step to see its boosts."
        picks={ancestryBoosts}
        onPick={setAncestrySlot}
        flaws={ancestryFlaws}
      />
      <BoostSourceBlock
        label={backgroundPick !== null ? `Background · ${backgroundPick.name}` : 'Background'}
        state={backgroundDoc}
        placeholderText="Pick a background on the previous step to see its boosts."
        picks={backgroundBoosts}
        onPick={setBackgroundSlot}
      />
      <BoostSourceBlock
        label={classPick !== null ? `Class · ${classPick.name} key attribute` : 'Class key attribute'}
        state={classDoc}
        placeholderText="Pick a class on the previous step to choose its key attribute."
        picks={classKeyAbility !== null ? [classKeyAbility] : [null]}
        onPick={(_slot, key): void => {
          setClassKeyAbility(key);
        }}
      />
      <FreeBoostBlock selected={levelOneBoosts} onToggle={toggleFreeBoost} />
    </div>
  );
}

// Lazy-fetches the compendium document for a picked item and parses
// its boost config. Cached per-pick so flipping between sources
// doesn't refetch. Returns an SourceDocState; callers render from
// whichever state surfaces.
function useSourceSlots(pick: CompendiumMatch | null, parse: (system: unknown) => ParsedSlot[]): SourceDocState {
  const [state, setState] = useState<SourceDocState>({ kind: 'idle' });
  useEffect(() => {
    if (pick === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'idle' });
      return;
    }
    const uuid = pick.uuid;

    setState({ kind: 'loading', uuid });
    let cancelled = false;
    void api
      .getCompendiumDocument(uuid)
      .then((res) => {
        if (cancelled) return;
        setState({ kind: 'ready', uuid, slots: parse(res.document.system) });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', uuid, message });
      });
    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.uuid]);
  return state;
}

function BoostSourceBlock({
  label,
  state,
  placeholderText,
  picks,
  onPick,
  flaws,
}: {
  label: string;
  state: SourceDocState;
  placeholderText: string;
  picks: (AbilityKey | null)[];
  onPick: (slotIdx: number, key: AbilityKey) => void;
  /** Optional read-only flaw slots (ancestry only for pf2e). The
   *  picks aren't ours — pf2e applies them automatically — so we
   *  just display them as context. */
  flaws?: SourceDocState;
}): React.ReactElement {
  const flawSlots = flaws?.kind === 'ready' ? flaws.slots : [];
  return (
    <section>
      <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</h3>
      {state.kind === 'idle' && <p className="text-xs italic text-pf-alt-dark">{placeholderText}</p>}
      {state.kind === 'loading' && <p className="text-xs italic text-pf-alt-dark">Loading…</p>}
      {state.kind === 'error' && <p className="text-xs text-pf-primary">Couldn&apos;t load: {state.message}</p>}
      {state.kind === 'ready' && state.slots.length === 0 && (
        <p className="text-xs italic text-pf-alt-dark">No boosts from this source.</p>
      )}
      {state.kind === 'ready' && state.slots.length > 0 && (
        <ul className="space-y-2">
          {state.slots.map((slot, idx) => (
            <li key={idx.toString()} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px] uppercase tracking-widest text-pf-alt">Boost {idx + 1}</span>
              <BoostSlotPicker
                slot={slot}
                selected={picks[idx] ?? null}
                onPick={(key): void => {
                  onPick(idx, key);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {flawSlots.length > 0 && <FlawChips slots={flawSlots} />}
    </section>
  );
}

function FlawChips({ slots }: { slots: ParsedSlot[] }): React.ReactElement {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-2" data-role="ancestry-flaws">
      <li className="text-[10px] uppercase tracking-widest text-pf-alt">Flaws</li>
      {slots.map((slot, idx) => {
        if (slot.kind === 'fixed') {
          const ability = slot.options[0];
          return (
            <li key={idx.toString()}>
              <span
                className="inline-flex items-center gap-1 rounded border border-pf-primary/40 bg-pf-primary/10 px-2 py-1 font-mono text-xs tabular-nums text-pf-primary"
                data-flaw={ability}
                title="Applied automatically by pf2e"
              >
                −1 {ability?.toUpperCase()}
              </span>
            </li>
          );
        }
        // Rare: ancestry with a choice of flaws. pf2e still applies
        // the selection; we surface the options as-is so the reader
        // knows a flaw is pending. MVP renders them read-only.
        return (
          <li key={idx.toString()}>
            <span className="inline-flex items-center gap-1 rounded border border-pf-primary/40 bg-pf-primary/10 px-2 py-1 text-[10px] uppercase tracking-widest text-pf-primary">
              −1 choice: {slot.options.map((o) => o.toUpperCase()).join(' / ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Parse `system.flaws` the same way we handle `system.boosts`, but
// drop empty slots (pf2e encodes "no flaw" as an empty-value entry,
// as with humans and half-elves). A flaw that becomes `kind: 'free'`
// with all six abilities is a no-op too — that's the empty-slot case
// re-hydrated by the shared parser, so discard it.
function parseAncestryFlaws(system: unknown): ParsedSlot[] {
  const raw = parseAncestryOrBackgroundSlots({ boosts: (system as { flaws?: unknown } | null)?.flaws });
  return raw.filter((slot) => {
    if (slot.options.length === 0) return false;
    if (slot.kind === 'free' && slot.options.length === ABILITY_KEYS.length) return false;
    return true;
  });
}

function BoostSlotPicker({
  slot,
  selected,
  onPick,
}: {
  slot: ParsedSlot;
  selected: AbilityKey | null;
  onPick: (key: AbilityKey) => void;
}): React.ReactElement {
  if (slot.kind === 'fixed') {
    const only = slot.options[0];
    return (
      <span
        className="rounded border border-pf-border bg-pf-tertiary/40 px-2 py-1 font-mono text-xs tabular-nums text-pf-alt-dark"
        data-boost-fixed={only}
      >
        {only?.toUpperCase()} (fixed)
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {slot.options.map((key) => {
        const isActive = selected === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={(): void => {
              onPick(key);
            }}
            data-boost-option={key}
            className={[
              'rounded border px-2 py-1 text-xs font-semibold uppercase tracking-widest transition-colors',
              isActive
                ? 'border-pf-primary bg-pf-tertiary/40 text-pf-primary'
                : 'border-pf-border bg-white text-pf-alt-dark hover:bg-pf-tertiary/20',
            ].join(' ')}
          >
            {key.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function FreeBoostBlock({
  selected,
  onToggle,
}: {
  selected: AbilityKey[];
  onToggle: (key: AbilityKey) => void;
}): React.ReactElement {
  const remaining = BOOSTS_REQUIRED - selected.length;
  return (
    <section>
      <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
        Level 1 · Free Boosts
      </h3>
      <p className="mb-2 text-xs text-pf-alt-dark">
        Pick {BOOSTS_REQUIRED} attributes to boost — on top of the fixed/choice boosts above.{' '}
        <span className="tabular-nums">{selected.length}</span>/{BOOSTS_REQUIRED} selected.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const picked = selected.includes(key);
          const locked = !picked && selected.length >= BOOSTS_REQUIRED;
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              data-attribute-tile={key}
              aria-pressed={picked}
              onClick={(): void => {
                onToggle(key);
              }}
              className={[
                'flex flex-col items-center rounded border px-2 py-3 transition-colors',
                picked
                  ? 'border-pf-primary bg-pf-tertiary/40'
                  : locked
                    ? 'cursor-not-allowed border-pf-border bg-white opacity-40'
                    : 'border-pf-border bg-white hover:bg-pf-tertiary/20',
              ].join(' ')}
            >
              <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
                {key.toUpperCase()}
              </span>
              <BoostedMod mod={0} boosted={picked} />
              <span className="text-[10px] text-pf-alt">{ABILITY_LABEL[key]}</span>
            </button>
          );
        })}
      </div>
      {remaining > 0 && (
        <p className="mt-1 text-xs italic text-pf-alt-dark">
          {remaining} more free pick{remaining === 1 ? '' : 's'} remaining.
        </p>
      )}
    </section>
  );
}

// Parse pf2e's `system.boosts` record on ancestries/backgrounds into
// ordered slot configs. A slot with a single-entry `value` array is
// pre-determined (fixed); multi-entry arrays are a constrained pick
// and empty arrays (rare flaw/legacy cases) are treated as free.
function parseAncestryOrBackgroundSlots(system: unknown): ParsedSlot[] {
  const boosts = (system as { boosts?: unknown } | null)?.boosts;
  if (boosts === undefined || boosts === null || typeof boosts !== 'object') return [];
  const out: ParsedSlot[] = [];
  // Iterate numerically indexed keys in order.
  const keys = Object.keys(boosts)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  for (const k of keys) {
    const slot = (boosts as Record<string, unknown>)[k] as { value?: unknown } | null;
    const raw = slot?.value;
    if (!Array.isArray(raw)) continue;
    const options = raw.filter(
      (v): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v),
    );
    if (options.length === 1) {
      out.push({ kind: 'fixed', options });
    } else if (options.length === 0) {
      // pf2e treats empty as "any"; surface all six.
      out.push({ kind: 'free', options: [...ABILITY_KEYS] });
    } else {
      out.push({ kind: 'free', options });
    }
  }
  return out;
}

function parseClassKeyAbility(system: unknown): ParsedSlot | null {
  const key = (system as { keyAbility?: { value?: unknown } } | null)?.keyAbility?.value;
  if (!Array.isArray(key)) return null;
  const options = key.filter(
    (v): v is AbilityKey => typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v),
  );
  if (options.length === 0) return null;
  if (options.length === 1) return { kind: 'fixed', options };
  return { kind: 'free', options };
}

// Seed initial picks from a slot config: fixed slots pre-fill,
// choice/free slots start null.
function seedPicks(slots: ParsedSlot[]): (AbilityKey | null)[] {
  return slots.map((s) => (s.kind === 'fixed' ? (s.options[0] ?? null) : null));
}

// Canonical pf2e core skills (remaster-era). Lore skills get named
// freely on the character sheet — not pickable here.
const CORE_SKILLS: readonly { slug: string; label: string }[] = [
  { slug: 'acrobatics', label: 'Acrobatics' },
  { slug: 'arcana', label: 'Arcana' },
  { slug: 'athletics', label: 'Athletics' },
  { slug: 'crafting', label: 'Crafting' },
  { slug: 'deception', label: 'Deception' },
  { slug: 'diplomacy', label: 'Diplomacy' },
  { slug: 'intimidation', label: 'Intimidation' },
  { slug: 'medicine', label: 'Medicine' },
  { slug: 'nature', label: 'Nature' },
  { slug: 'occultism', label: 'Occultism' },
  { slug: 'performance', label: 'Performance' },
  { slug: 'religion', label: 'Religion' },
  { slug: 'society', label: 'Society' },
  { slug: 'stealth', label: 'Stealth' },
  { slug: 'survival', label: 'Survival' },
  { slug: 'thievery', label: 'Thievery' },
];

interface TrainedSkillsDoc {
  value: string[];
  lore?: string[];
  additional?: number;
}

type SkillsDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; uuid: string; bgTrained: TrainedSkillsDoc; classTrained: TrainedSkillsDoc }
  | { kind: 'error'; uuid: string; message: string };

function SkillsStep({
  actorId,
  backgroundPick,
  classPick,
  classItemId,
  skillPicks,
  intMod,
  onDraftPatch,
}: {
  actorId: string | null;
  backgroundPick: CompendiumMatch | null;
  classPick: CompendiumMatch | null;
  classItemId: string | null;
  skillPicks: string[];
  intMod: number;
  onDraftPatch: (patch: Partial<Draft>) => void;
}): React.ReactElement {
  const [state, setState] = useState<SkillsDocState>({ kind: 'idle' });

  useEffect(() => {
    if (backgroundPick === null || classPick === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'idle' });
      return;
    }
    const bgUuid = backgroundPick.uuid;
    const clsUuid = classPick.uuid;
    const compositeKey = `${bgUuid}|${clsUuid}`;

    setState({ kind: 'loading', uuid: compositeKey });
    let cancelled = false;
    void Promise.all([api.getCompendiumDocument(bgUuid), api.getCompendiumDocument(clsUuid)])
      .then(([bgRes, clsRes]) => {
        if (cancelled) return;
        const bgTrained = normaliseTrainedSkills(bgRes.document.system);
        const classTrained = normaliseTrainedSkills(clsRes.document.system);
        setState({ kind: 'ready', uuid: compositeKey, bgTrained, classTrained });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', uuid: compositeKey, message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [backgroundPick?.uuid, classPick?.uuid]);

  const flushPicks = (picks: string[]): void => {
    if (actorId === null || classItemId === null) return;
    if (state.kind !== 'ready') return;
    // Rebuild the class item's `trainedSkills.value` as the
    // compendium-original fixed skills plus the user's picks. Saved
    // via dot-notation so Foundry's deep merge targets the exact
    // nested field.
    const merged = Array.from(new Set([...state.classTrained.value, ...picks]));
    void api
      .updateActorItem(actorId, classItemId, {
        system: { 'trainedSkills.value': merged },
      })
      .catch((err: unknown) => {
        console.warn('Failed to flush trained skills', err);
      });
  };

  const togglePick = (slug: string): void => {
    if (state.kind !== 'ready') return;
    const already = skillPicks.includes(slug);
    const freeAllowance = (state.classTrained.additional ?? 0) + Math.max(0, intMod);
    if (!already && skillPicks.length >= freeAllowance) return;
    const next = already ? skillPicks.filter((s) => s !== slug) : [...skillPicks, slug];
    onDraftPatch({ skillPicks: next });
    flushPicks(next);
  };

  if (state.kind === 'idle') {
    return (
      <p className="text-sm italic text-pf-alt-dark">
        Pick a background and class on the earlier steps to choose initial skill trainings.
      </p>
    );
  }
  if (state.kind === 'loading') return <p className="text-sm italic text-pf-alt-dark">Loading…</p>;
  if (state.kind === 'error') return <p className="text-sm text-pf-primary">Couldn&apos;t load: {state.message}</p>;

  const freeAllowance = (state.classTrained.additional ?? 0) + Math.max(0, intMod);
  const fixedFromClass = new Set(state.classTrained.value);
  const fixedFromBg = new Set(state.bgTrained.value);
  const fixedFromAny = new Set([...fixedFromClass, ...fixedFromBg]);
  const remaining = freeAllowance - skillPicks.length;

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
          Fixed trainings
        </h3>
        <ul className="flex flex-wrap gap-1">
          {[...fixedFromAny].map((slug) => (
            <li
              key={slug}
              className="inline-flex items-center gap-1 rounded border border-pf-border bg-pf-tertiary/40 px-2 py-1 text-xs tabular-nums text-pf-alt-dark"
              title={fixedFromClass.has(slug) ? 'Granted by class' : 'Granted by background'}
            >
              {prettySkillLabel(slug)}
            </li>
          ))}
          {(state.bgTrained.lore ?? []).map((lore) => (
            <li
              key={`lore-${lore}`}
              className="inline-flex items-center gap-1 rounded border border-pf-border bg-pf-tertiary/40 px-2 py-1 text-xs tabular-nums text-pf-alt-dark"
              title="Lore from background"
            >
              {lore}
            </li>
          ))}
          {fixedFromAny.size === 0 && (state.bgTrained.lore ?? []).length === 0 && (
            <li className="text-xs italic text-pf-alt">No fixed trainings from background / class.</li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
          Free trainings
        </h3>
        <p className="mb-2 text-xs text-pf-alt-dark">
          Pick {freeAllowance} skill{freeAllowance === 1 ? '' : 's'} — {state.classTrained.additional ?? 0} from class
          {intMod > 0 ? ` + ${intMod.toString()} from Intelligence` : ''}.{' '}
          <span className="tabular-nums">{skillPicks.length}</span>/{freeAllowance} picked.
        </p>
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {CORE_SKILLS.map((skill) => {
            const fixed = fixedFromAny.has(skill.slug);
            const picked = skillPicks.includes(skill.slug);
            const locked = !picked && !fixed && skillPicks.length >= freeAllowance;
            return (
              <li key={skill.slug}>
                <button
                  type="button"
                  disabled={fixed || locked}
                  aria-pressed={picked || fixed}
                  data-skill={skill.slug}
                  onClick={(): void => {
                    togglePick(skill.slug);
                  }}
                  className={[
                    'flex w-full items-center justify-between rounded border px-2 py-1 text-xs transition-colors',
                    fixed
                      ? 'cursor-not-allowed border-pf-border bg-pf-tertiary/40 text-pf-alt-dark'
                      : picked
                        ? 'border-pf-primary bg-pf-tertiary/40 text-pf-primary'
                        : locked
                          ? 'cursor-not-allowed border-pf-border bg-white text-pf-alt-dark opacity-40'
                          : 'border-pf-border bg-white text-pf-text hover:bg-pf-tertiary/20',
                  ].join(' ')}
                >
                  <span>{skill.label}</span>
                  {fixed && <span className="text-[10px] uppercase tracking-widest">Fixed</span>}
                  {picked && !fixed && <span className="text-[10px] uppercase tracking-widest">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {remaining > 0 && (
          <p className="mt-1 text-xs italic text-pf-alt-dark">
            {remaining} more pick{remaining === 1 ? '' : 's'} remaining.
          </p>
        )}
      </section>
    </div>
  );
}

// Curated fallback list of pf2e core languages. Displayed alongside
// the ancestry's "suggested additional" list so the user can pick
// any reasonable option without us hardcoding every exotic. The
// ancestry's suggested list bubbles to the top of the picker.
const COMMON_LANGUAGES: readonly { slug: string; label: string }[] = [
  { slug: 'common', label: 'Common' },
  { slug: 'draconic', label: 'Draconic' },
  { slug: 'dwarven', label: 'Dwarven' },
  { slug: 'elven', label: 'Elven' },
  { slug: 'fey', label: 'Fey' },
  { slug: 'goblin', label: 'Goblin' },
  { slug: 'halfling', label: 'Halfling' },
  { slug: 'jotun', label: 'Jotun' },
  { slug: 'kholo', label: 'Kholo' },
  { slug: 'necril', label: 'Necril' },
  { slug: 'orcish', label: 'Orcish' },
  { slug: 'sakvroth', label: 'Sakvroth' },
  { slug: 'thieves-cant', label: "Thieves' Cant" },
  { slug: 'empyrean', label: 'Empyrean' },
  { slug: 'chthonian', label: 'Chthonian' },
  { slug: 'diabolic', label: 'Diabolic' },
];

interface AncestryLanguagesDoc {
  fixed: string[];
  suggested: string[];
  bonusCount: number;
}

type LanguagesDocState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; uuid: string; data: AncestryLanguagesDoc }
  | { kind: 'error'; uuid: string; message: string };

function LanguagesStep({
  actorId,
  ancestryPick,
  languagePicks,
  intMod,
  onDraftPatch,
  onAllowanceResolved,
}: {
  actorId: string | null;
  ancestryPick: CompendiumMatch | null;
  languagePicks: string[];
  intMod: number;
  onDraftPatch: (patch: Partial<Draft>) => void;
  // Called when we've resolved the total free-language allowance
  // (ancestry bonus count + positive Int mod), so the Review section
  // can distinguish "no picks possible" from "user didn't pick any".
  onAllowanceResolved: (allowance: number) => void;
}): React.ReactElement {
  const [state, setState] = useState<LanguagesDocState>({ kind: 'idle' });

  useEffect(() => {
    if (ancestryPick === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'idle' });
      return;
    }
    const uuid = ancestryPick.uuid;

    setState({ kind: 'loading', uuid });
    let cancelled = false;
    void api
      .getCompendiumDocument(uuid)
      .then((res) => {
        if (cancelled) return;
        const data = normaliseAncestryLanguages(res.document.system);
        setState({ kind: 'ready', uuid, data });
        onAllowanceResolved(Math.max(0, intMod) + data.bonusCount);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', uuid, message });
      });
    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestryPick?.uuid, intMod]);

  const flushPicks = (picks: string[]): void => {
    if (actorId === null) return;
    if (state.kind !== 'ready') return;
    // pf2e keeps the canonical list on `actor.system.details.languages.value` —
    // it recomputes `build.languages` during prep from `granted + details`.
    // We write the granted fixed set union the user's picks.
    const merged = Array.from(new Set([...state.data.fixed, ...picks]));
    void api
      .updateActor(actorId, {
        system: { details: { languages: { value: merged } } },
      })
      .catch((err: unknown) => {
        console.warn('Failed to flush languages', err);
      });
  };

  const togglePick = (slug: string): void => {
    if (state.kind !== 'ready') return;
    if (state.data.fixed.includes(slug)) return;
    const allowance = Math.max(0, intMod) + state.data.bonusCount;
    const already = languagePicks.includes(slug);
    if (!already && languagePicks.length >= allowance) return;
    const next = already ? languagePicks.filter((s) => s !== slug) : [...languagePicks, slug];
    onDraftPatch({ languagePicks: next });
    flushPicks(next);
  };

  if (state.kind === 'idle') {
    return (
      <p className="text-sm italic text-pf-alt-dark">Pick an ancestry on the earlier steps to choose languages.</p>
    );
  }
  if (state.kind === 'loading') return <p className="text-sm italic text-pf-alt-dark">Loading…</p>;
  if (state.kind === 'error') return <p className="text-sm text-pf-primary">Couldn&apos;t load: {state.message}</p>;

  const allowance = Math.max(0, intMod) + state.data.bonusCount;
  const suggested = state.data.suggested;
  const fixedSet = new Set(state.data.fixed);
  // Rank the picker: ancestry-suggested first, then the rest of
  // the common list. De-dupe + drop anything already fixed.
  const ordered: { slug: string; label: string; suggested: boolean }[] = [];
  const seen = new Set<string>();
  for (const slug of suggested) {
    if (fixedSet.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    ordered.push({ slug, label: prettyLanguageLabel(slug), suggested: true });
  }
  for (const lang of COMMON_LANGUAGES) {
    if (fixedSet.has(lang.slug) || seen.has(lang.slug)) continue;
    seen.add(lang.slug);
    ordered.push({ ...lang, suggested: false });
  }
  const remaining = allowance - languagePicks.length;

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
          Granted by ancestry
        </h3>
        <ul className="flex flex-wrap gap-1">
          {state.data.fixed.length === 0 && (
            <li className="text-xs italic text-pf-alt">No fixed languages from this ancestry.</li>
          )}
          {state.data.fixed.map((slug) => (
            <li
              key={slug}
              className="inline-flex items-center gap-1 rounded border border-pf-border bg-pf-tertiary/40 px-2 py-1 text-xs tabular-nums text-pf-alt-dark"
            >
              {prettyLanguageLabel(slug)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
          Additional languages
        </h3>
        <p className="mb-2 text-xs text-pf-alt-dark">
          Pick {allowance} more — {intMod > 0 ? `${intMod.toString()} from Intelligence` : 'none from Intelligence'}
          {state.data.bonusCount > 0 ? ` + ${state.data.bonusCount.toString()} from your ancestry` : ''}.{' '}
          <span className="tabular-nums">{languagePicks.length}</span>/{allowance} picked. Suggested languages (from
          your ancestry) sit first.
        </p>
        {allowance === 0 ? (
          <p className="text-xs italic text-pf-alt">No extra language picks available.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {ordered.map((lang) => {
              const picked = languagePicks.includes(lang.slug);
              const locked = !picked && languagePicks.length >= allowance;
              return (
                <li key={lang.slug}>
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={picked}
                    data-language={lang.slug}
                    onClick={(): void => {
                      togglePick(lang.slug);
                    }}
                    className={[
                      'flex w-full items-center justify-between rounded border px-2 py-1 text-xs transition-colors',
                      picked
                        ? 'border-pf-primary bg-pf-tertiary/40 text-pf-primary'
                        : locked
                          ? 'cursor-not-allowed border-pf-border bg-white text-pf-alt-dark opacity-40'
                          : 'border-pf-border bg-white text-pf-text hover:bg-pf-tertiary/20',
                    ].join(' ')}
                  >
                    <span>{lang.label}</span>
                    {lang.suggested && (
                      <span className="text-[10px] uppercase tracking-widest text-pf-alt-dark">★</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {remaining > 0 && allowance > 0 && (
          <p className="mt-1 text-xs italic text-pf-alt-dark">
            {remaining} more pick{remaining === 1 ? '' : 's'} remaining.
          </p>
        )}
      </section>
    </div>
  );
}

function normaliseAncestryLanguages(system: unknown): AncestryLanguagesDoc {
  const sys = system as {
    languages?: { value?: unknown };
    additionalLanguages?: { count?: unknown; value?: unknown };
  } | null;
  const fixed = Array.isArray(sys?.languages?.value)
    ? sys.languages.value.filter((v): v is string => typeof v === 'string')
    : [];
  const suggested = Array.isArray(sys?.additionalLanguages?.value)
    ? sys.additionalLanguages.value.filter((v): v is string => typeof v === 'string')
    : [];
  const bonusCount = typeof sys?.additionalLanguages?.count === 'number' ? sys.additionalLanguages.count : 0;
  return { fixed, suggested, bonusCount };
}

function prettyLanguageLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normaliseTrainedSkills(system: unknown): TrainedSkillsDoc {
  const ts = (system as { trainedSkills?: { value?: unknown; lore?: unknown; additional?: unknown } } | null)
    ?.trainedSkills;
  const value = Array.isArray(ts?.value) ? ts.value.filter((v): v is string => typeof v === 'string') : [];
  const lore = Array.isArray(ts?.lore) ? ts.lore.filter((v): v is string => typeof v === 'string') : [];
  const additional = typeof ts?.additional === 'number' ? ts.additional : 0;
  return { value, lore, additional };
}

// Int bonus count at creation = number of INT boosts across all
// sources. Flaws subtract, but no ancestry flaws to INT exist in the
// core rules we care about.
function computeIntMod(draft: Draft): number {
  let n = 0;
  for (const k of draft.levelOneBoosts) if (k === 'int') n++;
  for (const k of draft.ancestryBoosts) if (k === 'int') n++;
  for (const k of draft.backgroundBoosts) if (k === 'int') n++;
  if (draft.classKeyAbility === 'int') n++;
  return n;
}

function prettySkillLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Sentinel used by ReviewStep so the renderer can tell "user hasn't
// picked yet" from "there was nothing available to pick" (Wizard
// class with no L1 class feat, Anadi with Int 0 → no extra
// languages, etc.).
const UNAVAILABLE = '__creator_unavailable__';

function ReviewStep({ draft }: { draft: Draft }): React.ReactElement {
  const textRow = (v: string): string | null => (v.trim().length > 0 ? v : null);
  const rows: Array<[string, string | null]> = [
    ['Name', textRow(draft.name)],
    ['Gender / Pronouns', textRow(draft.gender)],
    ['Age', textRow(draft.age)],
    ['Ethnicity', textRow(draft.ethnicity)],
    ['Nationality', textRow(draft.nationality)],
    ['Deity', draft.deity?.match.name ?? null],
    ['Ancestry', draft.ancestry?.match.name ?? null],
    ['Heritage', draft.heritage?.match.name ?? null],
    ['Ancestry Feat', draft.ancestryFeat?.match.name ?? null],
    ['Class', draft.class?.match.name ?? null],
    ['Class Feat', draft.classFeat?.match.name ?? (draft.classGrantsL1Feat === false ? UNAVAILABLE : null)],
    ['Background', draft.background?.match.name ?? null],
    ['L1 Boosts', draft.levelOneBoosts.length > 0 ? draft.levelOneBoosts.map((k) => k.toUpperCase()).join(', ') : null],
    ['Free Skills', draft.skillPicks.length > 0 ? draft.skillPicks.map(prettySkillLabel).join(', ') : null],
    [
      'Additional Languages',
      draft.languagePicks.length > 0
        ? draft.languagePicks.map(prettyLanguageLabel).join(', ')
        : draft.languageAllowance === 0
          ? UNAVAILABLE
          : null,
    ],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-pf-text">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</dt>
          <dd>
            {value === null ? (
              <span className="italic text-neutral-400">Not chosen</span>
            ) : value === UNAVAILABLE ? (
              <span className="italic text-pf-alt-dark">Not granted by this character</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function filtersForTarget(target: PickerTarget, draft: Draft): PickerFilters {
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

function isStepFilled(step: Step, draft: Draft): boolean {
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

const BOOSTS_REQUIRED = 4;

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

// Add the newly-picked compendium item to the actor, then delete the
// previous pick for this slot (if any). Returns the new Slot for the
// caller to commit into the draft. Order matters: add first so a
// transient network failure doesn't leave the actor with zero items
// for the slot.
async function persistPick(actorId: string, target: PickerTarget, match: CompendiumMatch, draft: Draft): Promise<Slot> {
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

function applyPickedSlot(draft: Draft, target: PickerTarget, slot: Slot): Draft {
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
