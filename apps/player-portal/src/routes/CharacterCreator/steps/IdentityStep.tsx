import { PickerCard } from '../PickerCard';
import type { Draft } from '../types';

// Identity text fields beyond name are free-form — pf2e stores them
// as arbitrary strings on `system.details` and the sheet renders them
// verbatim. Deity is the one exception; it has to land in the picker
// because pf2e keys deity by compendium uuid for clergy/cleric gates
// later on.
type IdentityTextField = 'name' | 'gender' | 'age' | 'ethnicity' | 'nationality';

export function IdentityStep({
  draft,
  onChange,
  onPickDeity,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onPickDeity: () => void;
}): React.ReactElement {
  const textFields: Array<{
    key: IdentityTextField;
    label: string;
    placeholder: string;
    autoFocus?: boolean;
    fullWidth?: boolean;
  }> = [
    { key: 'name', label: 'Name', placeholder: 'e.g. Lutharion Saverin', autoFocus: true, fullWidth: true },
    { key: 'gender', label: 'Gender / Pronouns', placeholder: 'e.g. she/her, non-binary' },
    { key: 'age', label: 'Age', placeholder: 'e.g. 31' },
    { key: 'ethnicity', label: 'Ethnicity', placeholder: 'e.g. Taldan' },
    { key: 'nationality', label: 'Nationality', placeholder: 'e.g. Andoran' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {textFields.map(({ key, label, placeholder, autoFocus, fullWidth }) => (
          <label
            key={key}
            className={[
              'block text-xs font-semibold uppercase tracking-widest text-pf-alt-dark',
              fullWidth === true ? 'sm:col-span-2' : '',
            ].join(' ')}
          >
            {label}
            <input
              id={`creator-${key}`}
              type="text"
              value={draft[key]}
              onChange={(e): void => {
                onChange({ [key]: e.target.value } as Partial<Draft>);
              }}
              autoFocus={autoFocus}
              placeholder={placeholder}
              className="mt-1 w-full rounded border border-pf-border bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-pf-text focus:border-pf-primary focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="border-t border-pf-border pt-4" data-creator-subpicker="deity">
        <PickerCard label="Deity" selection={draft.deity?.match ?? null} onOpen={onPickDeity} />
      </div>
    </div>
  );
}
