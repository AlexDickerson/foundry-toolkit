import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { CompendiumMatch } from '../api/types';
import { FeatPicker } from '../components/creator/FeatPicker';
import { PromptModal } from '../components/creator/PromptModal';
import { usePendingPrompts } from '../lib/usePendingPrompts';

import { CreatorSection } from './CharacterCreator/CreatorSection';
import { EMPTY_DRAFT, PICKER_LABEL, STEPS, STEP_LABEL } from './CharacterCreator/constants';
import {
  applyPickedSlot,
  beginOrReusePendingActor,
  filtersForTarget,
  isStepFilled,
  persistPick,
  resetPendingActor,
} from './CharacterCreator/helpers';
import { PickerCard } from './CharacterCreator/PickerCard';
import { AncestryStep } from './CharacterCreator/steps/AncestryStep';
import { AttributesStep } from './CharacterCreator/steps/AttributesStep';
import { ClassStep } from './CharacterCreator/steps/ClassStep';
import { IdentityStep } from './CharacterCreator/steps/IdentityStep';
import { LanguagesStep } from './CharacterCreator/steps/LanguagesStep';
import { ReviewStep } from './CharacterCreator/steps/ReviewStep';
import { SkillsStep } from './CharacterCreator/steps/SkillsStep';
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
          className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark"
        >
          ← Actors
        </button>
        <h1 className="font-serif text-2xl font-semibold text-pf-text">New Character</h1>
      </div>

      {creator.kind === 'creating' && (
        <p className="rounded border border-pf-border bg-pf-bg p-4 text-sm italic text-pf-alt-dark">
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
          <div className="sticky top-0 z-10 -mx-1 mb-4 bg-stage-gradient px-1 pb-2 pt-2">
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
                    : 'border-pf-border bg-pf-bg text-pf-alt-dark hover:bg-pf-bg-dark',
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
