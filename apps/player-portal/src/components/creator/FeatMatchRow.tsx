import type { CompendiumMatch } from '../../api/types';
import type { Evaluation } from '../../prereqs';

// ─── Match list ─────────────────────────────────────────────────────────

/**
 * Splits results into ancestry-specific + versatile buckets when any match
 * carries `isVersatile`. Keeps a flat list otherwise so non-heritage
 * searches render unchanged.
 */
export function FeatMatchList({
  matches,
  evaluations,
  activeUuid,
  onSelect,
}: {
  matches: CompendiumMatch[];
  evaluations: Map<string, Evaluation>;
  activeUuid: string | undefined;
  onSelect: (m: CompendiumMatch) => void;
}): React.ReactElement {
  const ancestrySpecific = matches.filter((m) => m.isVersatile !== true);
  const versatile = matches.filter((m) => m.isVersatile === true);

  if (versatile.length === 0) {
    return (
      <ul className="divide-y divide-pf-border">
        {matches.map((match) => (
          <li key={match.uuid}>
            <FeatMatchRow
              match={match}
              active={activeUuid === match.uuid}
              evaluation={evaluations.get(match.uuid)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {ancestrySpecific.length > 0 && (
        <ul className="divide-y divide-pf-border" data-match-group="ancestry-specific">
          {ancestrySpecific.map((match) => (
            <li key={match.uuid}>
              <FeatMatchRow
                match={match}
                active={activeUuid === match.uuid}
                evaluation={evaluations.get(match.uuid)}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
      <h3 className="border-t border-pf-border bg-pf-bg-dark/40 px-3 py-1.5 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
        Versatile Heritages
      </h3>
      <ul className="divide-y divide-pf-border" data-match-group="versatile">
        {versatile.map((match) => (
          <li key={match.uuid}>
            <FeatMatchRow
              match={match}
              active={activeUuid === match.uuid}
              evaluation={evaluations.get(match.uuid)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

// ─── Individual row ─────────────────────────────────────────────────────

export function FeatMatchRow({
  match,
  active,
  evaluation,
  onSelect,
}: {
  match: CompendiumMatch;
  active: boolean;
  evaluation: Evaluation | undefined;
  onSelect: (match: CompendiumMatch) => void;
}): React.ReactElement {
  const traitsSummary = match.traits && match.traits.length > 0 ? match.traits.slice(0, 5).join(', ') : '';
  const fails = evaluation === 'fails';
  const unknown = evaluation === 'unknown';
  const rowTitle = fails
    ? "Character doesn't meet this feat's prerequisites"
    : unknown
      ? "Prereqs couldn't be auto-checked — verify manually before picking"
      : undefined;
  return (
    <button
      type="button"
      onClick={(): void => {
        onSelect(match);
      }}
      data-match-uuid={match.uuid}
      data-prereq-state={evaluation ?? 'pending'}
      aria-pressed={active}
      title={rowTitle}
      className={[
        'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
        active ? 'bg-pf-tertiary/50' : 'hover:bg-pf-tertiary/20',
        fails ? 'opacity-60' : '',
      ].join(' ')}
    >
      {match.img && (
        <img src={match.img} alt="" className="h-8 w-8 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-medium text-pf-text">{match.name}</span>
            {unknown && (
              <span
                data-testid="prereq-unknown-badge"
                aria-label="Prereqs unchecked"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500 bg-amber-100 text-[10px] font-semibold text-amber-800"
              >
                !
              </span>
            )}
          </span>
          {match.level !== undefined && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
              L{match.level}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 text-[10px] text-pf-alt">
          <span className="truncate">{match.packLabel}</span>
          {traitsSummary && <span className="truncate">{traitsSummary}</span>}
        </div>
      </div>
    </button>
  );
}
