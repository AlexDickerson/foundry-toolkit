import type { PreparedCharacter } from '../../api/types';
import { formatAncestryLine } from '../../lib/format';

interface Props {
  character: PreparedCharacter;
  /** When provided, renders a "← Actors" link to the right of the
   *  name row. Lets the character sheet reclaim the row the button
   *  used to occupy above the header. */
  onBack?: () => void;
  /** When provided, renders a gear button in the right-side action
   *  cluster that opens the sheet settings dialog. */
  onSettingsOpen?: () => void;
}

// Rarity pill colours borrowed from pf2e's _colors.scss rarity palette
// (`--color-rarity-*`). Background/foreground tuned for contrast on the
// cream sheet surface.
const RARITY_CLASSES: Record<string, string> = {
  uncommon: 'border-pf-rarity-uncommon bg-pf-rarity-uncommon/10 text-pf-rarity-uncommon',
  rare: 'border-pf-rarity-rare bg-pf-rarity-rare/10 text-pf-rarity-rare',
  unique: 'border-pf-rarity-unique bg-pf-rarity-unique/10 text-pf-rarity-unique',
};

const ALLIANCE_CLASSES: Record<string, string> = {
  party: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  opposition: 'border-pf-primary bg-pf-primary/10 text-pf-primary',
};

// Identity band at the top of the character sheet: name + level +
// ancestry/heritage/class/background, plus rarity/alliance badges.
// Ported in spirit from pf2e's
// static/templates/actors/character/partials/header.hbs but
// render-only (no name/level inputs, no XP bar).
export function SheetHeader({ character, onBack, onSettingsOpen }: Props): React.ReactElement {
  const { name, system, items } = character;
  const level = system.details.level.value;
  const ancestry = system.details.ancestry?.name;
  const heritage = system.details.heritage?.name;
  const cls = system.details.class?.name;
  // Background lives as an item (type='background'); pf2e doesn't
  // surface it under system.details.
  const background = items.find((i) => i.type === 'background')?.name;
  const rarity = system.traits.rarity;
  const alliance = system.details.alliance;

  const identity = formatAncestryLine(heritage, ancestry);
  const subtitle = [`Level ${level.toString()}`, cls, background, identity].filter(Boolean).join(' · ');

  return (
    <header className="mb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-serif text-2xl font-semibold text-pf-text">{name}</h1>
        {rarity && rarity !== 'common' && (
          <Badge data-badge="rarity" label={capitalise(rarity)} className={RARITY_CLASSES[rarity] ?? ''} />
        )}
        {alliance && (
          <Badge data-badge="alliance" label={capitalise(alliance)} className={ALLIANCE_CLASSES[alliance] ?? ''} />
        )}
        {(onSettingsOpen || onBack) && (
          <div className="ml-auto flex items-center gap-2 self-center">
            {onSettingsOpen && (
              <button
                type="button"
                onClick={onSettingsOpen}
                data-testid="open-settings"
                aria-label="Settings"
                title="Settings"
                className="flex h-7 w-7 items-center justify-center rounded border border-pf-border bg-pf-bg text-pf-text hover:bg-pf-bg"
              >
                <GearIcon />
              </button>
            )}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                data-testid="back-to-actors"
                className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg"
              >
                ← Actors
              </button>
            )}
          </div>
        )}
      </div>
      {subtitle && (
        <p className="mt-0.5 font-sans text-sm text-pf-alt" data-section="identity">
          {subtitle}
        </p>
      )}
    </header>
  );
}

function Badge({
  label,
  className,
  ...rest
}: {
  label: string;
  className: string;
  'data-badge'?: string;
}): React.ReactElement {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${className}`}
      {...rest}
    >
      {label}
    </span>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function GearIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
