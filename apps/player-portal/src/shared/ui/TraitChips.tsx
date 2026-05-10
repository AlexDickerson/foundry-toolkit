/**
 * Pill-shaped trait list. Two visual variants:
 *   - `tertiary` (default) — feats, spells, crafting, hover-popover descriptions.
 *   - `subdued`            — actions / strikes, where the chips share row-space
 *                            with action buttons and need to read quieter.
 *
 * Accepts either bare slug strings (rendered with `humanize`) or
 * `{ name, label }` pairs where the label is already presentation-ready
 * (used for strike traits that come pre-localized from the prepared payload).
 */
interface TraitChipsProps {
  traits: readonly (string | { name: string; label: string })[];
  variant?: 'tertiary' | 'subdued';
  /** Override the outer `<ul>` class — useful for tightening top margin. */
  className?: string;
}

const VARIANT_CLASS = {
  tertiary: 'rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark',
  subdued: 'rounded-full border border-pf-border bg-pf-bg px-1.5 py-0.5 text-[10px] text-pf-text-muted',
} as const;

export function TraitChips({ traits, variant = 'tertiary', className }: TraitChipsProps): React.ReactElement | null {
  if (traits.length === 0) return null;
  const itemClass = VARIANT_CLASS[variant];
  return (
    <ul className={className ?? 'flex flex-wrap gap-1'}>
      {traits.map((t) => {
        if (typeof t === 'string') {
          return (
            <li key={t} className={itemClass}>
              {humanize(t)}
            </li>
          );
        }
        return (
          <li key={t.name} className={itemClass} title={t.name}>
            {t.label}
          </li>
        );
      })}
    </ul>
  );
}

function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
