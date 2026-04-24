import { prettyLanguageLabel, prettySkillLabel } from '../helpers';
import type { Draft } from '../types';

// Sentinel used so the renderer can tell "user hasn't picked yet"
// from "there was nothing available to pick" (Wizard class with no
// L1 class feat, Anadi with Int 0 → no extra languages, etc.).
const UNAVAILABLE = '__creator_unavailable__';

export function ReviewStep({ draft }: { draft: Draft }): React.ReactElement {
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
