import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type QAStrike = {
  kind: 'strike';
  id: string;
  slug: string;
  label: string;
  img: string;
  variants: { label: string }[];
};
export type QAItem = { kind: 'item'; id: string; itemId: string; label: string; img: string };
export type QASpell = {
  kind: 'spell';
  id: string;
  spellId: string;
  label: string;
  img: string;
  entryId: string;
  rank: number;
  isCantrip: boolean;
};
export type QuickActionOption = QAStrike | QAItem | QASpell;

interface Props {
  options: QuickActionOption[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onClose: () => void;
}

export function QuickActionPicker({ options, selectedIds, onSelectionChange, onClose }: Props): React.ReactElement {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return (): void => { document.removeEventListener('keydown', handler); };
  }, [onClose]);

  const toggle = (id: string): void => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const strikes = options.filter((o): o is QAStrike => o.kind === 'strike');
  const items = options.filter((o): o is QAItem => o.kind === 'item');
  const spells = options.filter((o): o is QASpell => o.kind === 'spell');

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-72 flex-col overflow-hidden border-l border-pf-border bg-pf-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-pf-border bg-pf-bg px-4 py-3">
          <div>
            <h2 className="border-l-2 border-pf-primary pl-3 font-serif text-sm font-bold uppercase tracking-wider text-pf-alt-dark">
              Quick Actions
            </h2>
            <p className="mt-0.5 pl-3 text-[10px] text-pf-text-muted">
              {selectedIds.length} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-0.5 rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text-muted hover:bg-pf-bg-dark"
          >
            Done
          </button>
        </div>

        {/* Option list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {strikes.length > 0 && (
            <PickerGroup label="Strikes" options={strikes} selectedIds={selectedIds} onToggle={toggle} />
          )}
          {items.length > 0 && (
            <PickerGroup label="Actions" options={items} selectedIds={selectedIds} onToggle={toggle} />
          )}
          {spells.length > 0 && (
            <PickerGroup label="Spells" options={spells} selectedIds={selectedIds} onToggle={toggle} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PickerGroup({
  label,
  options,
  selectedIds,
  onToggle,
}: {
  label: string;
  options: QuickActionOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}): React.ReactElement {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-pf-text-muted">{label}</p>
      <ul className="space-y-1">
        {options.map((opt) => {
          const selected = selectedIds.includes(opt.id);
          const imgSrc = opt.img ? (opt.img.startsWith('/') ? opt.img : `/${opt.img}`) : '';
          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => { onToggle(opt.id); }}
                className={[
                  'flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors',
                  selected
                    ? 'border-pf-primary bg-pf-primary/5 text-pf-text'
                    : 'border-pf-border bg-pf-bg text-pf-text hover:bg-pf-bg-dark',
                ].join(' ')}
              >
                {imgSrc && (
                  <img src={imgSrc} alt="" className="h-6 w-6 shrink-0 rounded border border-pf-border/50 bg-pf-bg-dark object-cover" />
                )}
                <span className="flex-1 truncate text-xs">{opt.label}</span>
                <span
                  className={[
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]',
                    selected
                      ? 'border-pf-primary bg-pf-primary text-white'
                      : 'border-pf-border',
                  ].join(' ')}
                >
                  {selected && '✓'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
