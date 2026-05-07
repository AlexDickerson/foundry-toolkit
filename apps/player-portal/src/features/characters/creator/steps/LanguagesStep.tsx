import { useEffect, useState } from 'react';
import { api } from '@/features/characters/api';
import type { CompendiumMatch } from '@/features/characters/types';
import { prettyLanguageLabel } from '../helpers';
import type { Draft } from '../types';

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

export function LanguagesStep({
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
                          ? 'cursor-not-allowed border-pf-border bg-pf-bg text-pf-alt-dark opacity-40'
                          : 'border-pf-border bg-pf-bg text-pf-text hover:bg-pf-tertiary/20',
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
