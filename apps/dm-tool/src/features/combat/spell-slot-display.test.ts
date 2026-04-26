import { describe, expect, it } from 'vitest';
import { isSpellUsable, slotDisplayKind } from './spell-slot-display';
import type { CombatSpellEntry } from '@foundry-toolkit/shared/types';

// ─── slotDisplayKind ─────────────────────────────────────────────────────────

describe('slotDisplayKind', () => {
  it('returns spontaneous for spontaneous entries', () => {
    expect(slotDisplayKind('spontaneous')).toBe('spontaneous');
  });

  it('returns focus for focus entries', () => {
    expect(slotDisplayKind('focus')).toBe('focus');
  });

  it('returns prepared for prepared entries', () => {
    expect(slotDisplayKind('prepared')).toBe('prepared');
  });

  it('returns none for innate entries', () => {
    expect(slotDisplayKind('innate')).toBe('none');
  });

  it('returns none for ritual entries', () => {
    expect(slotDisplayKind('ritual')).toBe('none');
  });

  it('returns none for items entries', () => {
    expect(slotDisplayKind('items')).toBe('none');
  });
});

// ─── isSpellUsable ───────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<CombatSpellEntry>): CombatSpellEntry {
  return {
    id: 'entry-1',
    name: 'Arcane Spellcasting',
    mode: 'prepared',
    tradition: 'arcane',
    spells: [],
    ...overrides,
  };
}

describe('isSpellUsable — spontaneous', () => {
  const entry = makeEntry({
    mode: 'spontaneous',
    slots: [
      { rank: 1, value: 2, max: 4 },
      { rank: 2, value: 0, max: 3 },
    ],
  });

  it('returns true when there are slots remaining', () => {
    expect(isSpellUsable(entry, 'spell-1', 1)).toBe(true);
  });

  it('returns false when slots are exhausted', () => {
    expect(isSpellUsable(entry, 'spell-1', 2)).toBe(false);
  });

  it('returns false when the rank has no slot entry', () => {
    expect(isSpellUsable(entry, 'spell-1', 5)).toBe(false);
  });
});

describe('isSpellUsable — prepared', () => {
  const entry = makeEntry({
    mode: 'prepared',
    spells: [
      {
        id: 'spell-ready',
        name: 'Magic Missile',
        rank: 1,
        isCantrip: false,
        actions: '1',
        expended: false,
        traits: [],
        range: '',
        area: '',
        target: '',
        description: '',
      },
      {
        id: 'spell-used',
        name: 'Shield',
        rank: 1,
        isCantrip: false,
        actions: '1',
        expended: true,
        traits: [],
        range: '',
        area: '',
        target: '',
        description: '',
      },
    ],
  });

  it('returns true when the spell is not expended', () => {
    expect(isSpellUsable(entry, 'spell-ready', 1)).toBe(true);
  });

  it('returns false when the spell is expended', () => {
    expect(isSpellUsable(entry, 'spell-used', 1)).toBe(false);
  });

  it('returns false when the spell is not found', () => {
    expect(isSpellUsable(entry, 'no-such-spell', 1)).toBe(false);
  });
});

describe('isSpellUsable — focus', () => {
  it('returns true when focus points remain', () => {
    const entry = makeEntry({ mode: 'focus', focusPoints: { value: 2, max: 3 } });
    expect(isSpellUsable(entry, 'spell-1', 3)).toBe(true);
  });

  it('returns false when focus pool is empty', () => {
    const entry = makeEntry({ mode: 'focus', focusPoints: { value: 0, max: 3 } });
    expect(isSpellUsable(entry, 'spell-1', 3)).toBe(false);
  });

  it('returns false when focusPoints is absent', () => {
    const entry = makeEntry({ mode: 'focus' });
    expect(isSpellUsable(entry, 'spell-1', 3)).toBe(false);
  });
});

describe('isSpellUsable — innate / ritual / items', () => {
  it.each(['innate', 'ritual', 'items'] as const)('returns true for %s (at-will)', (mode) => {
    const entry = makeEntry({ mode });
    expect(isSpellUsable(entry, 'spell-1', 1)).toBe(true);
  });
});
