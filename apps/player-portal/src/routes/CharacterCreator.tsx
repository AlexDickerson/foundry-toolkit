import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AbilityKey, CompendiumMatch } from '../api/types';
import { ABILITY_KEYS } from '../api/types';
import { BoostedMod } from '../components/creator/AbilityBoostPicker';
import { FeatPicker } from '../components/creator/FeatPicker';
import { PromptModal } from '../components/creator/PromptModal';
import { usePendingPrompts } from '../lib/usePendingPrompts';

import { CreatorSection } from './CharacterCreator/CreatorSection';
import {
  ABILITY_LABEL,
  BOOSTS_REQUIRED,
  EMPTY_DRAFT,
  PICKER_LABEL,
  STEPS,
  STEP_LABEL,
} from './CharacterCreator/constants';
import {
  applyPickedSlot,
  beginOrReusePendingActor,
  filtersForTarget,
  isStepFilled,
  persistPick,
  prettyLanguageLabel,
  prettySkillLabel,
  resetPendingActor,
} from './CharacterCreator/helpers';
import { PickerCard } from './CharacterCreator/PickerCard';
import { AncestryStep } from './CharacterCreator/steps/AncestryStep';
import { ClassStep } from './CharacterCreator/steps/ClassStep';
import { IdentityStep } from './CharacterCreator/steps/IdentityStep';
import { ReviewStep } from './CharacterCreator/steps/ReviewStep';
import type { CreatorState, Draft, PickerTarget, Step } from './CharacterCreator/types';

// Character creation wizard — Phase 1: identity + core choices.
// Opening the wizard creates a blank actor in Foundry and the wizard
// patches it piecemeal as steps are filled. Text fields flush on
// step-advance; picks sync immediately (add the compendium item,
// delete the previous pick for that slot). "Finish" lands the user
// on the live sheet view for further allocation.

export function CharacterCreator(): React.ReactElement {
  const navigate = useNavigate();
  const onBack = (): void => {
    void navigate('/characters');
  };
  const onFinish = (actorId: string): void => {
    void navigate(`/characters/${actorId}`);
  };
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
    <main className="mx-auto max-w-3xl p-6 font-sans">
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
    </main>
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
