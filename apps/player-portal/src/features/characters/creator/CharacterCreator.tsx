import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/features/characters/api';
import type { CompendiumMatch } from '@/features/characters/types';
import { useCreatorPickerProps, type CreatorPickerOptions } from '@/features/characters/internal/useCreatorPickerProps';
import { CompendiumDetailPanel } from '@/features/characters/internal/CompendiumDetailPanel';
import { PromptQueue } from '@/features/characters/sheet/dialog/PromptQueue';
import { CompendiumPicker } from '@/features/characters/internal/CompendiumPicker';

import { CreatorSection } from '@/features/characters/creator/CreatorSection';
import { TipsRail } from '@/features/characters/creator/TipsRail';
import { EMPTY_DRAFT, PICKER_LABEL, STEPS, STEP_LABEL } from '@/features/characters/creator/constants';
import {
  applyPickedSlot,
  beginOrReusePendingActor,
  filtersForTarget,
  groupHeritages,
  hydrateFromActor,
  isStepFilled,
  persistPick,
  resetPendingActor,
  saveDraftFlags,
} from '@/features/characters/creator/helpers';
import { PickerCard } from '@/features/characters/creator/PickerCard';
import { AncestryStep } from '@/features/characters/creator/steps/AncestryStep';
import { AttributesStep } from '@/features/characters/creator/steps/AttributesStep';
import { ClassStep } from '@/features/characters/creator/steps/ClassStep';
import { IdentityStep } from '@/features/characters/creator/steps/IdentityStep';
import { LanguagesStep } from '@/features/characters/creator/steps/LanguagesStep';
import { ReviewStep } from '@/features/characters/creator/steps/ReviewStep';
import { SkillsStep } from '@/features/characters/creator/steps/SkillsStep';
import type { CreatorState, Draft, PickerTarget, Step } from '@/features/characters/creator/types';

// Character creation wizard — Phase 1: identity + core choices.
// Opening the wizard creates a blank actor in Foundry and the wizard
// patches it piecemeal as steps are filled. Text fields flush on
// step-advance; picks sync immediately (add the compendium item,
// delete the previous pick for that slot). "Finish" lands the user
// on the live sheet view for further allocation.

export function CharacterCreator(): React.ReactElement {
  const navigate = useNavigate();
  // When mounted under `/characters/:actorId/edit`, the param is set.
  // When mounted under `/characters/new`, it is undefined.
  const { actorId: editActorId } = useParams<{ actorId?: string }>();
  const isEditMode = editActorId !== undefined;

  const onBack = (): void => {
    void navigate('/characters');
  };
  const onFinish = (actorId: string): void => {
    void navigate(`/characters/${actorId}`);
  };
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [openPicker, setOpenPicker] = useState<PickerTarget | null>(null);
  const [creator, setCreator] = useState<CreatorState>({ kind: 'creating' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (isEditMode && editActorId !== undefined) {
      // Edit mode — hydrate draft from the existing actor, don't spawn a new one.
      hydrateFromActor(editActorId)
        .then(({ draft: loadedDraft, error }) => {
          if (cancelled) return;
          if (error !== null) {
            setCreator({ kind: 'error', message: error });
            return;
          }
          setDraft(loadedDraft);
          setCreator({ kind: 'ready', actorId: editActorId });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          setCreator({ kind: 'error', message });
        });
    } else {
      // Create mode — spawn a blank draft actor in Foundry.
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
    }

    return (): void => {
      cancelled = true;
    };
  }, [isEditMode, editActorId]);

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

  const handleSaveAndContinue = (): void => {
    if (actorId === null) return;
    setIsSaving(true);
    saveDraftFlags(actorId, draft, 'in-progress')
      .catch(() => {
        // Best-effort — navigate away even if the flag write fails.
        // On next resume the fallback hydration path applies.
      })
      .finally(() => {
        resetPendingActor();
        void navigate('/characters');
      });
  };

  const handleFinish = (): void => {
    if (actorId === null) return;
    // Write completion flags best-effort — navigate regardless.
    saveDraftFlags(actorId, draft, 'completed').catch(() => {
      /* ignore */
    });
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
    // Three-column shell: tips rail on the left, wizard in the middle, a
    // phantom column of equal width on the right. The whole row is
    // capped at the natural total width of those three columns + their
    // gaps and `mx-auto`'d so the layout sits centred on the page — the
    // rails take equal visual space, and the wizard exactly fills its
    // slot (no auto-centring inside the slot, which is what created the
    // earlier heavy margin between rail and wizard).
    //
    // 1376px = 280 (rail) + 24 (gap) + 768 (max-w-3xl) + 24 (gap) + 280
    // (phantom). Below `lg` the rails collapse and the wizard takes the
    // full row.
    <div className="mx-auto flex max-w-[1376px] gap-6 py-6 font-sans">
      <aside className="hidden w-[280px] shrink-0 pl-3 lg:block" aria-label="Player tips">
        <TipsRail />
      </aside>
      <main className="min-w-0 max-w-3xl flex-1 px-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={(): void => {
              if (!isEditMode) {
                // Null the module-scope cache so re-entering the wizard
                // allocates a fresh draft actor instead of reusing the
                // one the user is stepping away from.
                resetPendingActor();
              }
              onBack();
            }}
            className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark"
          >
            ← Actors
          </button>
          <h1 className="font-serif text-2xl font-semibold text-pf-text">
            {isEditMode ? 'Edit Character' : 'New Character'}
          </h1>
        </div>

        {creator.kind === 'creating' && (
          <p className="rounded border border-pf-border bg-pf-bg p-4 text-sm italic text-pf-alt-dark">
            {isEditMode ? 'Loading character…' : 'Creating draft actor…'}
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
                helpText="The culture, society, or role your character developed in. Grants stat boosts and a small set of features that reflect that history."
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
                alternateAncestryBoosts={draft.alternateAncestryBoosts}
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
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleSaveAndContinue}
                  disabled={actorId === null || isSaving}
                  className="rounded border border-pf-border bg-pf-bg px-3 py-1.5 text-sm text-pf-text hover:bg-pf-bg-dark disabled:opacity-40"
                >
                  {isSaving ? 'Saving…' : 'Save & continue later'}
                </button>
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
              <CreatorPicker
                key={openPicker}
                target={openPicker}
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
        <PromptQueue />
      </main>
      <div className="hidden w-[280px] shrink-0 lg:block" aria-hidden="true" />
    </div>
  );
}

// Small wrapper that lets the wizard render CompendiumPicker directly while
// still scoping the prereq + sort + source-filter state per picker open.
// Keying the parent on `target` remounts this component when the user
// switches from e.g. Ancestry to Class — resetting the picker's local state.
function CreatorPicker({
  target,
  filters,
  onPick,
  onClose,
}: {
  target: PickerTarget;
  filters: NonNullable<ReturnType<typeof filtersForTarget>>;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}): React.ReactElement {
  // Heritage uses a grouped list with its own split-pane detail flow.
  // Split into a dedicated component so hooks are not called conditionally.
  if (target === 'heritage') {
    return <HeritagePicker filters={filters} onPick={onPick} onClose={onClose} />;
  }
  return <DefaultCreatorPicker target={target} filters={filters} onPick={onPick} onClose={onClose} />;
}

// Per-target picker options. Each entry:
//   - default to common-only rarity (new players default to the Player
//     Core options; uncommon/rare picks typically need GM approval,
//     surfaced as a Tips Rail card)
//   - hide the unmet-prereq toggle (these picks have no prereqs)
//   - hide the alpha/level sort (these picks aren't levelled; alpha
//     order is fine without an explicit toggle)
//   - may scope source defaults (backgrounds default to the two Player
//     Core books; ancestries leave sources unconstrained since Howl-
//     of-the-Wild and others are common-rarity too).
const PICKER_OPTIONS_BY_TARGET: Partial<Record<PickerTarget, CreatorPickerOptions>> = {
  ancestry: {
    initialRarities: ['common'],
    showUnmetToggle: false,
    showSortToggle: false,
  },
  background: {
    initialSources: ['Pathfinder Player Core', 'Pathfinder Player Core 2'],
    initialRarities: ['common'],
    showUnmetToggle: false,
    showSortToggle: false,
  },
  // Deity picker: no prereqs and no level dimension, so the hide-unmet
  // toggle and the A-Z / Level sort are noise. Source and (default)
  // rarity controls stay since pf2e ships hundreds of deities across
  // many supplements.
  deity: {
    showUnmetToggle: false,
    showSortToggle: false,
  },
  // Class picker:
  //   - default to common-only rarity (Player Core / Player Core 2
  //     classes); the rarity pill row lets the player opt in to
  //     uncommon supplements with GM approval
  //   - hide source picker, unmet toggle, sort toggle — only the text
  //     search and rarity filter add value here, and the row was
  //     getting cramped
  //   - tighten the list column so the detail panel (initial-
  //     proficiencies block + L1 features) gets the room
  //   - hide the detail panel header — the picker dialog's own title
  //     bar already names the class
  class: {
    initialRarities: ['common'],
    showSourcePicker: false,
    showUnmetToggle: false,
    showSortToggle: false,
    hideDetailHeader: true,
    listOpenWidthClass: 'w-56',
  },
};

function DefaultCreatorPicker({
  target,
  filters,
  onPick,
  onClose,
}: {
  target: PickerTarget;
  filters: NonNullable<ReturnType<typeof filtersForTarget>>;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}): React.ReactElement {
  const props = useCreatorPickerProps(filters, undefined, onPick, PICKER_OPTIONS_BY_TARGET[target]);
  return <CompendiumPicker title={`Choose a ${PICKER_LABEL[target]}`} {...props} onClose={onClose} />;
}

// Heritage picker: shows a grouped list (Primary / Versatile) with AoN art
// thumbnails. Manages its own detail-panel state so the user can read a
// heritage's description before committing. The split-pane is driven from
// outside CompendiumPicker so we can control when `detailTarget` is set —
// clicking a row opens the panel; the panel's Pick button calls `onPick`
// and closes the whole dialog.
function HeritagePicker({
  filters,
  onPick,
  onClose,
}: {
  filters: NonNullable<ReturnType<typeof filtersForTarget>>;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}): React.ReactElement {
  const [detailTarget, setDetailTarget] = useState<CompendiumMatch | null>(null);
  const pickerProps = useCreatorPickerProps(filters, undefined, onPick);
  const { docCache } = pickerProps;

  const renderList = (items: CompendiumMatch[]): ReactNode => {
    const { primary, versatile } = groupHeritages(items);
    return (
      <>
        {primary.length > 0 && (
          <HeritageSection
            label="Primary Heritages"
            items={primary}
            activeUuid={detailTarget?.uuid ?? null}
            onRowClick={setDetailTarget}
          />
        )}
        {versatile.length > 0 && (
          <HeritageSection
            label="Versatile Heritages"
            items={versatile}
            activeUuid={detailTarget?.uuid ?? null}
            onRowClick={setDetailTarget}
          />
        )}
      </>
    );
  };

  return (
    <CompendiumPicker
      title="Choose a Heritage"
      {...pickerProps}
      renderList={renderList}
      splitPane={{
        detailOpen: detailTarget !== null,
        detailSlot:
          detailTarget !== null ? (
            <CompendiumDetailPanel
              target={detailTarget}
              onPick={(): void => {
                onPick(detailTarget);
                onClose();
              }}
              onClose={(): void => {
                setDetailTarget(null);
              }}
              {...(docCache !== undefined ? { docCache } : {})}
            />
          ) : null,
      }}
      onClose={onClose}
    />
  );
}

function HeritageSection({
  label,
  items,
  activeUuid,
  onRowClick,
}: {
  label: string;
  items: CompendiumMatch[];
  activeUuid: string | null;
  onRowClick: (m: CompendiumMatch) => void;
}): React.ReactElement {
  return (
    <div>
      <p className="border-b border-pf-border bg-pf-bg-dark px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
        {label}
      </p>
      <ul className="divide-y divide-pf-border">
        {items.map((m) => (
          <HeritageRow key={m.uuid} match={m} active={activeUuid === m.uuid} onClick={onRowClick} />
        ))}
      </ul>
    </div>
  );
}

function HeritageRow({
  match,
  active,
  onClick,
}: {
  match: CompendiumMatch;
  active: boolean;
  onClick: (m: CompendiumMatch) => void;
}): React.ReactElement {
  return (
    <li>
      <button
        type="button"
        onClick={(): void => {
          onClick(match);
        }}
        aria-pressed={active}
        className={[
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
          active ? 'bg-pf-tertiary/50' : 'hover:bg-pf-tertiary/20',
        ].join(' ')}
        data-pick-uuid={match.uuid}
        data-match-uuid={match.uuid}
      >
        {match.img ? (
          <img src={match.img} alt="" className="h-8 w-8 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
        ) : null}
        <span className="text-sm font-medium text-pf-text">{match.name}</span>
      </button>
    </li>
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
