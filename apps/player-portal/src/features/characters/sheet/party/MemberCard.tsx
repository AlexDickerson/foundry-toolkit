import { useNavigate } from 'react-router-dom';
import type { PartyMember } from '@foundry-toolkit/shared/rpc';

interface Props {
  member: PartyMember;
  isCurrent: boolean;
  /** Compact horizontal layout for the mobile top strip. */
  compact?: boolean;
}

function HpBar({ value, max }: { value: number; max: number }): React.ReactElement {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const colorClass = pct > 0.5 ? 'bg-green-500' : pct > 0.25 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-pf-border">
      <div className={`h-1.5 rounded-full transition-all ${colorClass}`} style={{ width: `${(pct * 100).toFixed(1)}%` }} />
    </div>
  );
}

export function MemberCard({ member, isCurrent, compact = false }: Props): React.ReactElement {
  const navigate = useNavigate();

  const handleClick = (): void => {
    void navigate(`/characters/${member.id}`);
  };

  const portraitEl = (
    <div
      className={`shrink-0 overflow-hidden rounded ${compact ? 'h-8 w-8' : 'aspect-[5/6] w-full'}`}
    >
      {member.img ? (
        <img src={member.img} alt={member.name} className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-pf-border text-xs font-bold text-pf-text-muted">
          {member.name[0] ?? '?'}
        </div>
      )}
    </div>
  );

  const statsRow = (
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded bg-pf-border px-1 py-0.5 text-[10px] tabular-nums text-pf-text-muted">
        AC {member.ac}
      </span>
      <span className="rounded bg-pf-border px-1 py-0.5 text-[10px] tabular-nums text-pf-text-muted">
        {member.perceptionMod >= 0 ? '+' : ''}
        {member.perceptionMod}
      </span>
      {Array.from({ length: member.heroPoints.max }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full ${i < member.heroPoints.value ? 'bg-pf-accent' : 'bg-pf-border'}`}
          title={i === 0 ? `Hero points: ${String(member.heroPoints.value)}/${String(member.heroPoints.max)}` : undefined}
        />
      ))}
    </div>
  );

  const conditionRow =
    member.shield !== null || member.conditions.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1">
        {member.shield !== null && member.shield.raised && (
          <span
            title={member.shield.broken ? 'Shield raised (broken)' : 'Shield raised'}
            className={`text-[11px] leading-none ${member.shield.broken ? 'opacity-50' : ''}`}
            aria-hidden="true"
          >
            🛡
          </span>
        )}
        {member.conditions.map((c) => (
          <span
            key={c.slug}
            title={c.value !== null ? `${c.slug} ${String(c.value)}` : c.slug}
            className="inline-flex items-center rounded-full bg-amber-100 px-1 py-0.5 text-[9px] font-semibold leading-none text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          >
            {c.slug[0]?.toUpperCase() ?? '?'}
            {c.value !== null ? c.value : ''}
          </span>
        ))}
      </div>
    ) : null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={[
          'flex w-32 shrink-0 items-center gap-2 rounded-lg border p-1.5 text-left transition-colors hover:bg-pf-bg-dark',
          isCurrent ? 'border-pf-accent bg-pf-bg-dark' : 'border-pf-border bg-pf-bg',
        ].join(' ')}
      >
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
          {member.img ? (
            <img src={member.img} alt={member.name} className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-pf-border text-xs font-bold text-pf-text-muted">
              {member.name[0] ?? '?'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-pf-text">{member.name}</p>
          <p className="text-[10px] tabular-nums text-pf-text-muted">
            {member.hp.value}/{member.hp.max}
          </p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        'w-full rounded-lg border text-left transition-colors hover:bg-pf-bg-dark',
        isCurrent ? 'border-pf-accent bg-pf-bg-dark' : 'border-pf-border bg-pf-bg',
      ].join(' ')}
    >
      {/* Portrait — full width, fixed height */}
      {portraitEl}

      <div className="space-y-1 p-2">
        <p className="truncate text-xs font-semibold leading-tight text-pf-text">{member.name}</p>
        <HpBar value={member.hp.value} max={member.hp.max} />
        <p className="text-[10px] tabular-nums text-pf-text-muted">
          {member.hp.value}/{member.hp.max}
          {member.hp.temp > 0 && <span className="text-blue-400"> +{member.hp.temp}</span>}
        </p>
        {statsRow}
        {conditionRow}
      </div>
    </button>
  );
}
