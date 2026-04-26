import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PreparedCharacter } from '../../api/types';
import { api } from '../../api/client';
import { formatAncestryLine } from '../../lib/format';
import { useActorAction } from '../../lib/useActorAction';
import { ConfirmDialog } from '../dialog/ConfirmDialog';

interface Props {
  character: PreparedCharacter;
  actorId: string;
  onActorChanged: () => void;
  /** When provided, renders a "← Actors" link in the action cluster. */
  onBack?: () => void;
  /** When provided, renders a gear button in the action cluster. */
  onSettingsOpen?: () => void;
}

const RARITY_CLASSES: Record<string, string> = {
  uncommon: 'border-pf-rarity-uncommon bg-pf-rarity-uncommon/10 text-pf-rarity-uncommon',
  rare: 'border-pf-rarity-rare bg-pf-rarity-rare/10 text-pf-rarity-rare',
  unique: 'border-pf-rarity-unique bg-pf-rarity-unique/10 text-pf-rarity-unique',
};

const ALLIANCE_CLASSES: Record<string, string> = {
  party: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  opposition: 'border-pf-primary bg-pf-primary/10 text-pf-primary',
};

export function SheetHeader({
  character,
  actorId,
  onActorChanged,
  onBack,
  onSettingsOpen,
}: Props): React.ReactElement {
  const { name, system, items } = character;
  const level = system.details.level.value;
  const ancestry = system.details.ancestry?.name;
  const heritage = system.details.heritage?.name;
  const cls = system.details.class?.name;
  const background = items.find((i) => i.type === 'background')?.name;
  const rarity = system.traits.rarity;
  const alliance = system.details.alliance;
  const xp = system.details.xp;
  const heroPoints = system.resources.heroPoints;

  const identity = formatAncestryLine(heritage, ancestry);
  const subtitle = [`Level ${level.toString()}`, cls, background, identity].filter(Boolean).join(' · ');

  const portraitSrc = !character.img ? '' : character.img.startsWith('/') ? character.img : `/${character.img}`;

  return (
    <header className="mb-4 flex items-start gap-3">
      <CharacterPortrait src={portraitSrc} name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          {/* Left: name, subtitle, XP + hero points */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-serif text-2xl font-bold text-pf-text">{name}</h1>
              {rarity && rarity !== 'common' && (
                <Badge data-badge="rarity" label={capitalise(rarity)} className={RARITY_CLASSES[rarity] ?? ''} />
              )}
              {alliance && (
                <Badge
                  data-badge="alliance"
                  label={capitalise(alliance)}
                  className={ALLIANCE_CLASSES[alliance] ?? ''}
                />
              )}
            </div>
            {subtitle && (
              <p className="mt-0.5 font-sans text-sm text-pf-alt" data-section="identity">
                {subtitle}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <XPDisplay xp={xp} />
              <HeroPointsControl heroPoints={heroPoints} actorId={actorId} onActorChanged={onActorChanged} />
            </div>
          </div>

          {/* Right: gear + back, then long rest below */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            {(onSettingsOpen !== undefined || onBack !== undefined) && (
              <div className="flex items-center gap-2">
                {onSettingsOpen && (
                  <button
                    type="button"
                    onClick={onSettingsOpen}
                    data-testid="open-settings"
                    aria-label="Settings"
                    title="Settings"
                    className="flex h-7 w-7 items-center justify-center rounded border border-pf-border bg-pf-bg text-pf-text hover:bg-pf-bg-dark"
                  >
                    <GearIcon />
                  </button>
                )}
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    data-testid="back-to-actors"
                    className="rounded border border-pf-border bg-pf-bg px-2 py-1 text-xs text-pf-text hover:bg-pf-bg-dark"
                  >
                    ← Actors
                  </button>
                )}
              </div>
            )}
            <LongRestButton actorId={actorId} onRested={onActorChanged} />
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function XPDisplay({ xp }: { xp: { value: number; max: number; pct: number } }): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, xp.pct));
  return (
    <div className="flex items-center gap-1.5" data-stat="xp">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">XP</span>
      <span className="font-mono text-xs tabular-nums text-pf-text-muted">
        {xp.value} / {xp.max}
      </span>
      <span
        className="inline-block h-1.5 w-12 overflow-hidden rounded bg-pf-bg-dark"
        role="progressbar"
        aria-valuenow={xp.value}
        aria-valuemin={0}
        aria-valuemax={xp.max}
        title={`${clamped.toString()}% to next level`}
      >
        <span className="block h-full bg-pf-secondary" style={{ width: `${clamped.toString()}%` }} />
      </span>
    </div>
  );
}

function HeroPointsControl({
  heroPoints,
  actorId,
  onActorChanged,
}: {
  heroPoints: { value: number; max: number };
  actorId: string;
  onActorChanged: () => void;
}): React.ReactElement {
  const adjust = useActorAction({
    run: (delta: number) => api.adjustActorResource(actorId, 'hero-points', delta),
    onSuccess: onActorChanged,
  });
  return (
    <div className="flex items-center gap-1" data-stat="hero-points">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">Hero Points</span>
      <MiniStepButton label="−" disabled={adjust.state === 'pending'} onClick={() => { adjust.trigger(-1); }} />
      <div
        className="flex gap-0.5"
        aria-label={`Hero Points: ${heroPoints.value.toString()} of ${heroPoints.max.toString()}`}
      >
        {Array.from({ length: heroPoints.max }, (_, i) => (
          <span
            key={i}
            className={[
              'inline-block h-2.5 w-2.5 rounded-full border',
              i < heroPoints.value ? 'border-rose-400 bg-rose-500' : 'border-pf-border bg-pf-bg',
            ].join(' ')}
          />
        ))}
      </div>
      <MiniStepButton label="+" disabled={adjust.state === 'pending'} onClick={() => { adjust.trigger(1); }} />
    </div>
  );
}

function LongRestButton({ actorId, onRested }: { actorId: string; onRested: () => void }): React.ReactElement {
  const { state, trigger, confirming } = useActorAction({
    run: () => api.longRest(actorId),
    confirm: 'Rest for the night? This restores HP, refreshes resources, and advances in-world time.',
    onSuccess: onRested,
  });
  const isError = typeof state === 'object';
  return (
    <>
      {confirming !== null && (
        <ConfirmDialog
          message={confirming.message}
          confirmLabel="Rest"
          onConfirm={confirming.accept}
          onCancel={confirming.cancel}
        />
      )}
      <div className="flex flex-col items-end gap-1" data-action="long-rest">
        <button
          type="button"
          onClick={() => { trigger(); }}
          disabled={state === 'pending'}
          className="rounded border border-pf-border bg-pf-bg px-3 py-1.5 text-sm font-semibold text-pf-text hover:border-pf-tertiary-dark hover:bg-pf-tertiary/40 disabled:opacity-50"
        >
          {state === 'pending' ? 'Resting…' : 'Long Rest'}
        </button>
        {isError && <span className="text-xs text-red-700">{state.error}</span>}
      </div>
    </>
  );
}

function MiniStepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-pf-border bg-pf-bg px-1 py-0.5 font-mono text-[10px] text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
    >
      {label}
    </button>
  );
}

// ─── Portrait ──────────────────────────────────────────────────────────

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

function PortraitLightbox({
  src,
  name,
  onClose,
}: {
  src: string;
  name: string;
  onClose: () => void;
}): React.ReactElement {
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

// ─── Badges ────────────────────────────────────────────────────────────

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

// ─── Icons ─────────────────────────────────────────────────────────────

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
