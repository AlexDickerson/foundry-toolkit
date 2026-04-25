import { describe, expect, it } from 'vitest';
import { formatItemType, formatUsage } from './item-display-helpers';

// ---------------------------------------------------------------------------
// formatUsage
// ---------------------------------------------------------------------------

describe('formatUsage', () => {
  it('converts hyphenated held-in slugs to readable strings', () => {
    expect(formatUsage('held-in-one-hand')).toBe('held in one hand');
    expect(formatUsage('held-in-two-hands')).toBe('held in two hands');
    expect(formatUsage('held-in-one-or-two-hands')).toBe('held in one or two hands');
  });

  it('formats worn-slot slugs as "worn (<slot>)"', () => {
    expect(formatUsage('worn-headwear')).toBe('worn (headwear)');
    expect(formatUsage('worn-gloves')).toBe('worn (gloves)');
    expect(formatUsage('worn-belt')).toBe('worn (belt)');
    expect(formatUsage('worn-necklace')).toBe('worn (necklace)');
    expect(formatUsage('worn-armbands')).toBe('worn (armbands)');
    expect(formatUsage('worn-armor')).toBe('worn (armor)');
  });

  it('passes through already-readable values unchanged', () => {
    // PF2e sometimes stores the value in display-ready form with spaces
    expect(formatUsage('held in 1 hand')).toBe('held in 1 hand');
    expect(formatUsage('worn')).toBe('worn');
    expect(formatUsage('carried')).toBe('carried');
    expect(formatUsage('stowed')).toBe('stowed');
  });

  it('replaces hyphens in arbitrary slugs', () => {
    expect(formatUsage('attached-to-firearm')).toBe('attached to firearm');
  });

  it('returns null for empty or nullish input', () => {
    expect(formatUsage(null)).toBeNull();
    expect(formatUsage(undefined)).toBeNull();
    expect(formatUsage('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatItemType
// ---------------------------------------------------------------------------

describe('formatItemType', () => {
  it('capitalizes the first character of the type slug', () => {
    expect(formatItemType('weapon')).toBe('Weapon');
    expect(formatItemType('armor')).toBe('Armor');
    expect(formatItemType('consumable')).toBe('Consumable');
    expect(formatItemType('equipment')).toBe('Equipment');
    expect(formatItemType('shield')).toBe('Shield');
    expect(formatItemType('treasure')).toBe('Treasure');
  });

  it('returns an empty string for nullish or empty input', () => {
    expect(formatItemType(null)).toBe('');
    expect(formatItemType(undefined)).toBe('');
    expect(formatItemType('')).toBe('');
  });
});
