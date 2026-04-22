import type { PreparedCharacter } from '../../api/types';

interface Props {
  character: PreparedCharacter;
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
export function SheetHeader({ character }: Props): React.ReactElement {
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

  const identity = [heritage, ancestry].filter(Boolean).join(' ');
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
