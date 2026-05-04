import type { ChatTargetResult } from '@foundry-toolkit/shared/rpc';

interface Props {
  targets: ChatTargetResult[];
}

type Outcome = NonNullable<ChatTargetResult['outcome']>;

const OUTCOME_LABEL: Record<Outcome, string> = {
  criticalSuccess: 'Crit Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Crit Fail',
};

const OUTCOME_CLASS: Record<Outcome, string> = {
  criticalSuccess: 'bg-green-100 text-green-700',
  success: 'bg-blue-100 text-blue-700',
  failure: 'bg-red-100 text-red-600',
  criticalFailure: 'bg-red-200 text-red-800',
};

function OutcomeBadge({ outcome }: { outcome: Outcome }): React.ReactElement {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${OUTCOME_CLASS[outcome]}`}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function TargetTable({ targets }: Props): React.ReactElement | null {
  if (targets.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {targets.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          {t.name.length > 0 && <span className="text-pf-text">{t.name}</span>}
          {t.actorId !== undefined && t.name.length === 0 && (
            <span className="font-mono text-[10px] text-pf-alt-dark/60">{t.actorId}</span>
          )}
          {t.outcome !== undefined && <OutcomeBadge outcome={t.outcome} />}
        </div>
      ))}
    </div>
  );
}
