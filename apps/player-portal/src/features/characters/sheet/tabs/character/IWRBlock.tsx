import type { IWREntry } from '@/features/characters/types';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { humaniseSlug } from './helpers';

export function IWRBlock({
  immunities,
  weaknesses,
  resistances,
}: {
  immunities: IWREntry[];
  weaknesses: IWREntry[];
  resistances: IWREntry[];
}): React.ReactElement | null {
  if (immunities.length === 0 && weaknesses.length === 0 && resistances.length === 0) return null;
  return (
    <div data-section="iwr" className="space-y-2">
      <SectionHeader band>Defenses</SectionHeader>
      <IWRRow label="Immunities" entries={immunities} />
      <IWRRow label="Weaknesses" entries={weaknesses} />
      <IWRRow label="Resistances" entries={resistances} />
    </div>
  );
}

function IWRRow({ label, entries }: { label: string; entries: IWREntry[] }): React.ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-iwr={label.toLowerCase()}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-text-muted">{label}</span>
      {entries.map((e, i) => (
        <span
          key={`${e.type}-${i.toString()}`}
          className="rounded-full border border-pf-border bg-pf-bg px-2.5 py-0.5 text-xs text-pf-text"
          title={e.exceptions?.length ? `except ${e.exceptions.join(', ')}` : undefined}
        >
          {humaniseSlug(e.type)}
          {e.value !== undefined ? ` ${e.value.toString()}` : ''}
        </span>
      ))}
    </div>
  );
}
