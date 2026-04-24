import { useEffect, useState } from 'react';
import type { AbilityKey } from '../../api/types';
import { ABILITY_KEYS } from '../../api/types';
import { formatSignedInt } from '../../lib/format';
import type { CharacterContext } from '../../prereqs';

interface Props {
  level: number;
  characterContext: CharacterContext;
  /** Previous pick (if any) seeds the initial selection so editing
   *  works without losing context. */
  initialSelection?: readonly AbilityKey[];
  onPick: (abilities: AbilityKey[]) => void;
  onClose: () => void;
}

// pf2e core rulebook "Ability Boosts" at L5 / L10 / L15 / L20: four
// boosts per set, each to a distinct ability. (Partial-boost math for
// abilities already at 18+ is NOT modelled here — we're picking which
// four ability lines to raise, the rule engine applies them later.)
const BOOSTS_PER_SET = 4;

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

// The displayed mod bumps by one when the tile is selected. A key
// swap on the span forces React to tear down / re-mount the element,
// which replays the CSS keyframe animation every toggle — enough to
// cue "the number just moved" without a digit-by-digit counter.
// Exported so the creator's attribute step can reuse the same
// animated tile treatment instead of drifting its own styling.
export function BoostedMod({ mod, boosted }: { mod: number; boosted: boolean }): React.ReactElement {
  const display = boosted ? mod + 1 : mod;
  return (
    <span
      key={boosted ? 'boosted' : 'base'}
      className={[
        'mt-0.5 font-mono text-xl font-semibold tabular-nums transition-colors duration-200',
        boosted ? 'animate-boost text-pf-primary' : 'text-pf-text',
      ].join(' ')}
      aria-label={boosted ? `boosted to ${formatSignedInt(display)}` : undefined}
    >
      {formatSignedInt(display)}
    </span>
  );
}

export function AbilityBoostPicker({
  level,
  characterContext,
  initialSelection = [],
  onPick,
  onClose,
}: Props): React.ReactElement {
  const [selected, setSelected] = useState<AbilityKey[]>([...initialSelection]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = previous;
    };
  }, []);

  const toggle = (key: AbilityKey): void => {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= BOOSTS_PER_SET) return prev;
      return [...prev, key];
    });
  };

  const canApply = selected.length === BOOSTS_PER_SET;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ability boosts for level ${level.toString()}`}
      data-testid="ability-boost-picker"
      className="fixed inset-0 z-50 flex items-start justify-center bg-pf-text/50 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded border border-pf-border bg-pf-bg shadow-xl"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between border-b border-pf-border px-4 py-2">
          <h2 className="font-serif text-lg font-semibold text-pf-text">Ability Boosts (Level {level})</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ability-boost picker"
            className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
          >
            ×
          </button>
        </header>
        <p className="border-b border-pf-border px-4 py-2 text-xs text-pf-alt">
          Pick {BOOSTS_PER_SET} distinct abilities to boost. <span className="tabular-nums">{selected.length}</span>/
          {BOOSTS_PER_SET} selected.
        </p>
        <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3">
          {ABILITY_KEYS.map((key) => {
            const isSelected = selected.includes(key);
            const locked = !isSelected && selected.length >= BOOSTS_PER_SET;
            const mod = characterContext.abilityMods[key];
            return (
              <button
                key={key}
                type="button"
                disabled={locked}
                data-ability={key}
                aria-pressed={isSelected}
                onClick={(): void => {
                  toggle(key);
                }}
                className={[
                  'flex flex-col items-center rounded border px-2 py-3 transition-colors',
                  isSelected
                    ? 'border-pf-primary bg-pf-tertiary/40'
                    : locked
                      ? 'cursor-not-allowed border-pf-border bg-white opacity-40'
                      : 'border-pf-border bg-white hover:bg-pf-tertiary/20',
                ].join(' ')}
              >
                <span className="text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
                  {key.toUpperCase()}
                </span>
                <BoostedMod mod={mod} boosted={isSelected} />
                <span className="text-[10px] text-pf-alt">{ABILITY_LABEL[key]}</span>
              </button>
            );
          })}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-pf-border bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-alt-dark hover:text-pf-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={(): void => {
              onPick(selected);
            }}
            data-testid="ability-boost-apply"
            className={[
              'rounded border px-3 py-1 text-xs font-semibold uppercase tracking-widest',
              canApply
                ? 'border-pf-primary bg-pf-primary text-white hover:brightness-110'
                : 'cursor-not-allowed border-pf-border bg-white text-pf-alt opacity-60',
            ].join(' ')}
          >
            Apply {selected.length}/{BOOSTS_PER_SET}
          </button>
        </footer>
      </div>
    </div>
  );
}
