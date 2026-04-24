import type { Modifier } from '../../api/types';
import { t } from '../../i18n/t';
import { formatSignedInt } from '../../lib/format';

interface Props {
  title: string;
  breakdown: string;
  modifiers: Modifier[];
}

// Hover tooltip that explains a statistic's breakdown. Filters out disabled
// modifiers the same way the Foundry sheet does — anything with
// `enabled:false` or `ignored:true` is for predicates that aren't currently
// matching (e.g. armor-check-penalty when wearing flexible armor).
export function ModifierTooltip({ title, breakdown, modifiers }: Props): React.ReactElement {
  const active = modifiers.filter((m) => m.enabled && !m.ignored);
  return (
    <div
      role="tooltip"
      className={[
        'invisible absolute left-0 top-full z-10 mt-1 w-72',
        'rounded border border-neutral-300 bg-white p-3 text-xs shadow-lg',
        'group-hover:visible',
      ].join(' ')}
    >
      <div className="mb-1 text-sm font-semibold text-neutral-900">{t(title)}</div>
      <div className="mb-2 text-neutral-600">{breakdown}</div>
      {active.length > 0 && (
        <ul className="space-y-0.5">
          {active.map((m) => (
            <li key={m.slug} className="flex items-center justify-between gap-2">
              <span className="text-neutral-700">{t(m.label)}</span>
              <span
                className={['font-mono tabular-nums', m.kind === 'penalty' ? 'text-red-700' : 'text-emerald-800'].join(
                  ' ',
                )}
              >
                {formatSignedInt(m.modifier)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
