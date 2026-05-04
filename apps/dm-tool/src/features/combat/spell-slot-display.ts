// Pure helpers for deciding which slot-display shape to use per
// spellcasting entry type. Kept separate from the React component so
// they can be tested without a browser environment.

import type { CombatSpellEntry, SpellPreparationMode } from '@foundry-toolkit/shared/types';

/** Which visual treatment to apply for this entry's slot state. */
type SlotDisplayKind =
  | 'spontaneous' // n/max per rank
  | 'focus' // dot indicators for focus points
  | 'prepared' // per-spell expended checkboxes (handled by SpellRow)
  | 'none'; // innate at-will, ritual, items — no slot display

/** Determine the slot display kind for a spellcasting entry. */
export function slotDisplayKind(mode: SpellPreparationMode): SlotDisplayKind {
  switch (mode) {
    case 'spontaneous':
      return 'spontaneous';
    case 'focus':
      return 'focus';
    case 'prepared':
      return 'prepared';
    case 'innate':
    case 'ritual':
    case 'items':
    default:
      return 'none';
  }
}

/** True when a spell row should show as usable (not blocked by slot state). */
export function isSpellUsable(entry: CombatSpellEntry, spellId: string, rank: number): boolean {
  const kind = slotDisplayKind(entry.mode);

  if (kind === 'none') return true;

  if (kind === 'focus') {
    const fp = entry.focusPoints;
    return fp !== undefined && fp.value > 0;
  }

  if (kind === 'spontaneous') {
    const slot = entry.slots?.find((s) => s.rank === rank);
    if (!slot) return false;
    return slot.value > 0;
  }

  if (kind === 'prepared') {
    const spell = entry.spells.find((s) => s.id === spellId);
    if (!spell) return false;
    return spell.expended !== true;
  }

  return true;
}
