import { useEffect, useState } from 'react';
import type { ProficiencyRank } from '../../api/types';
import type { CharacterContext } from '../../prereqs';

interface Props {
  level: number;
  characterContext: CharacterContext;
  /** Slug + target rank. Caller persists; the skill's current rank
   *  is derived at apply time, not baked in here. */
  onPick: (skill: string, newRank: ProficiencyRank) => void;
  onClose: () => void;
}

// pf2e core rulebook "Skill Increase" rules: the rank a skill-increase
// slot can raise you TO caps at Expert (2) from L3, Master (3) from L9,
// Legendary (4) from L15. Below L3 the slot doesn't open (we never
// render the picker for those levels — Progression gates it).
function rankCapAtLevel(level: number): ProficiencyRank {
  if (level >= 15) return 4;
  if (level >= 9) return 3;
  return 2;
}

const RANK_LABEL: Record<ProficiencyRank, string> = {
  0: 'Untrained',
  1: 'Trained',
  2: 'Expert',
  3: 'Master',
  4: 'Legendary',
};

// A skill-increase picker for one slot. Lists every skill the character
// has on record; rows that are already at (or above) the slot's rank
// cap grey out so the rules gate is immediate. Clicking a row commits
// the pick as `(slug, current rank + 1)`.
export function SkillIncreasePicker({ level, characterContext, onPick, onClose }: Props): React.ReactElement {
  const cap = rankCapAtLevel(level);
  // Row click *stages* a selection; committing happens via Apply so
  // the user can change their mind before the pick persists.
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Skills come from the prepared payload via CharacterContext.
  // Sort alphabetically for scanability; lore-type skills share the
  // same shape so they appear inline.
  const skills = Array.from(characterContext.skillRanks.entries())
    .map(([slug, rank]) => {
      const canIncrease = rank < cap;
      const nextRank = (rank + 1) as ProficiencyRank;
      return { slug, rank, canIncrease, nextRank };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Skill increase for level ${level.toString()}`}
      data-testid="skill-increase-picker"
      className="fixed inset-0 z-50 flex items-start justify-center bg-pf-text/50 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded border border-pf-border bg-pf-bg shadow-xl"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between border-b border-pf-border px-4 py-2">
          <h2 className="font-serif text-lg font-semibold text-pf-text">Skill Increase (Level {level})</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close skill-increase picker"
            className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
          >
            ×
          </button>
        </header>
        <p className="border-b border-pf-border px-4 py-2 text-xs text-pf-alt">
          Pick a skill to advance by one rank. At L{level} the cap is{' '}
          <strong className="text-pf-alt-dark">{RANK_LABEL[cap]}</strong>; already-capped skills are greyed out.
        </p>
        <ul className="flex-1 divide-y divide-pf-border overflow-y-auto" data-testid="skill-increase-list">
          {skills.map((s) => {
            const isSelected = selected === s.slug;
            return (
              <li key={s.slug}>
                <button
                  type="button"
                  disabled={!s.canIncrease}
                  data-skill={s.slug}
                  aria-pressed={isSelected}
                  title={
                    s.canIncrease
                      ? undefined
                      : `Already at ${RANK_LABEL[s.rank]} — can't advance at L${level.toString()}`
                  }
                  onClick={(): void => {
                    setSelected(s.slug);
                  }}
                  className={[
                    'flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors',
                    !s.canIncrease
                      ? 'cursor-not-allowed opacity-50'
                      : isSelected
                        ? 'bg-pf-tertiary/50'
                        : 'hover:bg-pf-tertiary/20',
                  ].join(' ')}
                >
                  <span className="text-sm text-pf-text">{capitaliseSlug(s.slug)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
                    {RANK_LABEL[s.rank]}
                    {s.canIncrease && <span className="ml-1 text-pf-primary">→ {RANK_LABEL[s.nextRank]}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-pf-border bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-alt-dark hover:text-pf-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected === null}
            onClick={(): void => {
              if (selected === null) return;
              const match = skills.find((s) => s.slug === selected);
              if (match && match.canIncrease) onPick(match.slug, match.nextRank);
            }}
            data-testid="skill-increase-apply"
            className={[
              'rounded border px-3 py-1 text-xs font-semibold uppercase tracking-widest',
              selected !== null
                ? 'border-pf-primary bg-pf-primary text-white hover:brightness-110'
                : 'cursor-not-allowed border-pf-border bg-white text-pf-alt opacity-60',
            ].join(' ')}
          >
            {selected !== null ? `Apply ${capitaliseSlug(selected)}` : 'Apply'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function capitaliseSlug(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
