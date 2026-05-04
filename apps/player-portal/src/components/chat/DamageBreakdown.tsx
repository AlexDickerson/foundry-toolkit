import type { ChatDamagePart } from '@foundry-toolkit/shared/rpc';

interface Props {
  parts: ChatDamagePart[];
  total: number;
}

export function DamageBreakdown({ parts, total }: Props): React.ReactElement {
  const showTotal = parts.length > 1;

  return (
    <div className="space-y-0.5">
      {parts.map((part, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-pf-alt-dark">{part.formula}</span>
          {part.damageType !== undefined && (
            <span className="capitalize text-[10px] text-pf-alt-dark/70">{part.damageType}</span>
          )}
          <span className="ml-auto font-bold tabular-nums text-pf-primary">{part.total}</span>
        </div>
      ))}
      {showTotal && (
        <div className="flex items-center justify-between border-t border-pf-border/30 pt-0.5 text-[11px] font-semibold">
          <span className="text-pf-alt-dark">Total</span>
          <span className="tabular-nums text-pf-primary">{total}</span>
        </div>
      )}
    </div>
  );
}
