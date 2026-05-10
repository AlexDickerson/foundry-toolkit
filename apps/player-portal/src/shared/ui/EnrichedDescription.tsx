import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';

interface EnrichedDescriptionProps {
  /** Raw description string (Foundry's `system.description.value`). When
   *  empty, the fallback is rendered instead. */
  raw?: string | undefined;
  /** Pre-enriched HTML, when the caller needs to pass options to
   *  `enrichDescription` (e.g. spell heightening). Takes precedence over
   *  `raw` if both are supplied. */
  html?: string | undefined;
  /** Rendered when the description is empty. Defaults to "No description.". */
  fallback?: React.ReactNode;
  /** Caps the rendered height with `max-h-...` so long descriptions scroll
   *  inside the panel instead of overflowing. Defaults to no cap. */
  maxHeightClass?: string;
  /** Extra classes appended to the body (positioning, margin). */
  className?: string;
}

const PROSE_CLASS =
  'leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2';

/**
 * Renders Foundry-enriched description HTML with the standard prose styling
 * (damage / template / link colors) — duplicated across every detail panel
 * before this component existed. Pass `raw` for the simple case; pass `html`
 * when the caller has already enriched (e.g. spells with heightening).
 */
export function EnrichedDescription({
  raw,
  html,
  fallback = <>No description.</>,
  maxHeightClass,
  className,
}: EnrichedDescriptionProps): React.ReactElement {
  const enriched = html !== undefined ? html : raw !== undefined && raw.length > 0 ? enrichDescription(raw) : '';
  if (enriched.length === 0) {
    return <p className={['italic text-pf-text-muted', className].filter(Boolean).join(' ')}>{fallback}</p>;
  }
  const wrapper = [
    PROSE_CLASS,
    maxHeightClass !== undefined ? `${maxHeightClass} overflow-y-auto pr-1` : null,
    className,
  ]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ');
  return <div className={wrapper} dangerouslySetInnerHTML={{ __html: enriched }} />;
}
