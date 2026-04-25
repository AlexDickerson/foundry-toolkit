import type { CompendiumMatch } from '../../api/types';

// Compact feat-slot chip for the L1 class/ancestry feat picks on
// the class/ancestry steps. Smaller and less imposing than the
// full PickerCard used for ancestry/class/deity itself.
export function FeatSlot({
  label,
  selection,
  disabled,
  disabledHint,
  onOpen,
}: {
  label: string;
  selection: CompendiumMatch | null;
  disabled?: boolean;
  disabledHint?: string;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2" data-feat-slot={label.toLowerCase().replace(/\s+/g, '-')}>
      <span className="w-36 shrink-0 font-serif text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
        {label}
      </span>
      {selection === null ? (
        <>
          <button
            type="button"
            onClick={onOpen}
            disabled={disabled === true}
            className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Choose
          </button>
          {disabled === true && disabledHint !== undefined && (
            <span className="text-xs italic text-pf-alt-dark">{disabledHint}</span>
          )}
        </>
      ) : (
        <>
          <span
            data-uuid={selection.uuid}
            className="inline-flex items-center gap-1.5 rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text"
          >
            <img src={selection.img} alt="" className="h-4 w-4 rounded bg-pf-bg-dark" />
            <span className="truncate">{selection.name}</span>
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-[10px] uppercase tracking-widest text-pf-alt-dark hover:bg-pf-bg-dark"
          >
            Change
          </button>
        </>
      )}
    </div>
  );
}
