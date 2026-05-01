import type { StatusEffect } from '../../../api/types';

export function StatusEffectsBlock({ effects }: { effects: StatusEffect[] }): React.ReactElement | null {
  if (effects.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1" data-section="status-effects">
      {effects.map((effect) => (
        <StatusEffectChip key={effect.id} effect={effect} />
      ))}
    </div>
  );
}

function StatusEffectChip({ effect }: { effect: StatusEffect }): React.ReactElement {
  const label = effect.badge !== undefined ? `${effect.name} ${effect.badge.value.toString()}` : effect.name;
  const tooltip = effect.description !== undefined ? `${label}\n\n${effect.description}` : label;

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-pf-border bg-pf-bg px-2.5 py-1 text-[11px] text-pf-text"
      title={tooltip}
      data-slug={effect.slug}
    >
      {effect.img.length > 0 && (
        <img src={effect.img} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
      )}
      <span className="font-medium leading-none">{effect.name}</span>
      {effect.badge !== undefined && (
        <span className="min-w-[1.1rem] rounded-full bg-pf-bg-dark px-1 text-center font-mono font-bold tabular-nums leading-none">
          {effect.badge.value}
        </span>
      )}
    </div>
  );
}
