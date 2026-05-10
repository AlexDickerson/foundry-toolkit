import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface DetailsCardProps extends Omit<ComponentPropsWithoutRef<'li'>, 'children'> {
  /** Trigger row, always visible. The expand-state chevron is appended
   *  automatically unless `hideChevron` is set. */
  summary: ReactNode;
  /** Expanded body. */
  children: ReactNode;
  /** Drop shadow on the open state. Defaults to `lg`; Actions / Spells use
   *  `md` because their cards live in tighter grids. */
  shadow?: 'md' | 'lg';
  /** Override the summary class entirely. Default centres children with
   *  `gap-2`; pass your own when you need top-alignment, larger gap, etc. */
  summaryClassName?: string;
  /** Override the panel class entirely. Default is the absolute-positioned
   *  full-width panel; pass a custom value when the panel needs to span
   *  multiple grid cells (Feats's two-column reveal). */
  panelClassName?: string;
  /** Suppress the appended chevron — useful when the summary's right edge
   *  is occupied by action buttons. */
  hideChevron?: boolean;
}

const DEFAULT_DETAILS_CLASS =
  'group rounded border border-pf-border bg-pf-bg open:rounded-b-none open:border-pf-primary/60';
const DEFAULT_SUMMARY_CLASS =
  'flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-pf-bg-dark/40 [&::-webkit-details-marker]:hidden';
const DEFAULT_PANEL_CLASS =
  'absolute left-0 right-0 top-full z-20 rounded-b border border-t-0 border-pf-primary/60 bg-pf-bg px-3 py-2 text-sm text-pf-text shadow-lg';

/**
 * Standard click-to-expand card used by Feats / Spells / Actions / Crafting /
 * Inventory list rows. Wraps native `<details>`/`<summary>` with the shared
 * border + open-state highlight + absolutely-positioned panel that overlays
 * the rows below rather than pushing them down.
 *
 * Uncontrolled by design: the browser's `<details>` open state is fine for
 * every current consumer. If a future caller needs to programmatically close
 * (e.g. after an action completes), this can grow a controlled `open` prop —
 * but defer that until there's an actual need.
 */
export function DetailsCard({
  summary,
  children,
  shadow = 'lg',
  summaryClassName,
  panelClassName,
  hideChevron = false,
  className,
  ...liProps
}: DetailsCardProps): React.ReactElement {
  const liClass = ['relative', className].filter(Boolean).join(' ');
  const detailsClass = `${DEFAULT_DETAILS_CLASS} open:shadow-${shadow}`;
  return (
    <li className={liClass} {...liProps}>
      <details className={detailsClass}>
        <summary className={summaryClassName ?? DEFAULT_SUMMARY_CLASS}>
          {summary}
          {!hideChevron && (
            <>
              {/* Chevrons sit at the natural end of the summary — caller is
               *  responsible for `flex-1`/`ml-auto` on their content if they
               *  want the chevron pinned right. Multiple `ml-auto` elements
               *  in a flex row each consume a slice of the leftover space, so
               *  forcing one here would fight any trailing action button. */}
              <span aria-hidden className="flex-shrink-0 self-center text-[10px] text-pf-alt-dark group-open:hidden">
                ▸
              </span>
              <span aria-hidden className="hidden flex-shrink-0 self-center text-[10px] text-pf-alt-dark group-open:inline">
                ▾
              </span>
            </>
          )}
        </summary>
        <div className={panelClassName ?? DEFAULT_PANEL_CLASS}>{children}</div>
      </details>
    </li>
  );
}
