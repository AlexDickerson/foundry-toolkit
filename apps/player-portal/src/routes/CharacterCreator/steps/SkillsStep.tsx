import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import type { CompendiumMatch } from '../../../api/types';
import { prettySkillLabel } from '../helpers';
import type { Draft } from '../types';

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

export function SkillsStep({
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
                          ? 'cursor-not-allowed border-pf-border bg-pf-bg text-pf-alt-dark opacity-40'
                          : 'border-pf-border bg-pf-bg text-pf-text hover:bg-pf-tertiary/20',
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

function normaliseTrainedSkills(system: unknown): TrainedSkillsDoc {
  const ts = (system as { trainedSkills?: { value?: unknown; lore?: unknown; additional?: unknown } } | null)
    ?.trainedSkills;
  const value = Array.isArray(ts?.value) ? ts.value.filter((v): v is string => typeof v === 'string') : [];
  const lore = Array.isArray(ts?.lore) ? ts.lore.filter((v): v is string => typeof v === 'string') : [];
  const additional = typeof ts?.additional === 'number' ? ts.additional : 0;
  return { value, lore, additional };
}
