import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Foundry asset paths are relative (e.g. "systems/pf2e/icons/...") — prepend
  // "/" so they resolve through the Vite/Fastify asset proxy.
  const portraitSrc = !character.img ? '' : character.img.startsWith('/') ? character.img : `/${character.img}`;

  return (
    <header className="mb-4 flex items-start gap-3">
      <CharacterPortrait src={portraitSrc} name={name} />
      <div className="min-w-0 flex-1">
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
      </div>
    </header>
  );
}

function CharacterPortrait({ src, name }: { src: string; name: string }): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!src || failed) {
    return (
      <div
        data-testid="character-portrait-placeholder"
        aria-hidden
        className="flex h-24 w-20 flex-shrink-0 items-center justify-center rounded border border-pf-border bg-pf-bg-dark text-pf-alt"
      >
        <PersonIcon />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(): void => setExpanded(true)}
        data-testid="character-portrait-button"
        aria-label={`View ${name} portrait`}
        title="View full portrait"
        className="flex-shrink-0 cursor-zoom-in rounded border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <img
          src={src}
          alt={`${name} portrait`}
          data-testid="character-portrait"
          onError={(): void => setFailed(true)}
          className="h-24 w-20 rounded border border-pf-border object-cover object-top"
        />
      </button>
      {expanded &&
        createPortal(
          <PortraitLightbox src={src} name={name} onClose={(): void => setExpanded(false)} />,
          document.body,
        )}
    </>
  );
}

function PortraitLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }): React.ReactElement {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return (): void => {
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={`${name} portrait`}
    >
      <img
        src={src}
        alt={`${name} portrait`}
        className="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
        onClick={(e): void => e.stopPropagation()}
      />
    </div>
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

function PersonIcon(): React.ReactElement {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
