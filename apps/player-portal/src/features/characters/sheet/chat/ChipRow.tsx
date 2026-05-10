import type { ChatChip } from '@foundry-toolkit/shared/rpc';

interface Props {
  chips: ChatChip[];
}

const CHIP_LABELS: Partial<Record<ChatChip['type'], string>> = {
  'roll-damage': 'Roll Damage',
  'place-template': 'Place Template',
  'apply-damage': 'Apply Damage',
  save: 'Save',
  shove: 'Shove',
  grapple: 'Grapple',
};

export function ChipRow({ chips }: Props): React.ReactElement | null {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip, i) => {
        const label = CHIP_LABELS[chip.type] ?? chip.label;
        return (
          <button
            key={i}
            type="button"
            disabled
            title="Not yet interactive"
            className="cursor-not-allowed select-none rounded border border-pf-border/50 bg-pf-bg px-2 py-0.5 text-[10px] font-medium text-pf-alt-dark opacity-60 pointer-events-none"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
