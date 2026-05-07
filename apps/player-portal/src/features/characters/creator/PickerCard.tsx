import type { CompendiumMatch } from '@/features/characters/types';

// Selected-pick card used by Identity (deity), Background, Ancestry,
// Class, etc. Renders an empty-state CTA when nothing is picked, or a
// summary tile with portrait + label + traits when something is.
export function PickerCard({
  label,
  selection,
  onOpen,
  disabled,
  disabledHint,
}: {
  label: string;
  selection: CompendiumMatch | null;
  onOpen: () => void;
  disabled?: boolean;
  disabledHint?: string;
}): React.ReactElement {
  if (selection === null) {
    return (
      <div className="flex flex-col items-start gap-2" data-picker-card={label.toLowerCase()}>
        <p className="text-sm text-pf-text">No {label.toLowerCase()} selected yet.</p>
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled === true}
          className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Choose {label}
        </button>
        {disabled === true && disabledHint !== undefined && (
          <p className="text-xs italic text-pf-alt-dark">{disabledHint}</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3" data-picker-card={label.toLowerCase()}>
      {selection.img !== '' && (
        <img
          src={selection.img}
          alt=""
          className="h-14 w-14 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-semibold text-pf-text">{selection.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">
          {label}
          {selection.level !== undefined && ` · Level ${selection.level.toString()}`}
        </p>
        {selection.traits !== undefined && selection.traits.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {selection.traits.slice(0, 8).map((t) => (
              <li
                key={t}
                className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled === true}
        className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Change
      </button>
    </div>
  );
}
