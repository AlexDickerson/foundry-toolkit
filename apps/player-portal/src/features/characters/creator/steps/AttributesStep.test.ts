import { describe, it, expect } from 'vitest';
import { BOOST_CAP, tallyBoosts, mergeBoostTallies, flawCountsFromSlots, disabledKeysForSlot } from './AttributesStep';
import type { ParsedSlot } from './AttributesStep';
import { ABILITY_KEYS } from '@/features/characters/types';

// Helper: build an allBoosts record with all zeros for easy test setup.
function zeroBoosts(): Record<string, number> {
  return Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0]));
}

describe('tallyBoosts', () => {
  it('counts each ability', () => {
    expect(tallyBoosts(['str', 'dex', 'str'])).toEqual({ str: 2, dex: 1 });
  });

  it('ignores null picks', () => {
    expect(tallyBoosts([null, 'con', null])).toEqual({ con: 1 });
  });

  it('returns empty object for all-null array', () => {
    expect(tallyBoosts([null, null])).toEqual({});
  });
});

describe('mergeBoostTallies', () => {
  it('sums across tallies and fills zero for unmentioned keys', () => {
    const result = mergeBoostTallies({ str: 2 }, { str: 1, dex: 1 });
    expect(result.str).toBe(3);
    expect(result.dex).toBe(1);
    expect(result.con).toBe(0);
  });

  it('handles empty input', () => {
    const result = mergeBoostTallies();
    expect(Object.values(result).every((v) => v === 0)).toBe(true);
  });
});

describe('flawCountsFromSlots', () => {
  it('counts fixed-flaw slots', () => {
    const slots: ParsedSlot[] = [{ kind: 'fixed', options: ['cha'] }];
    expect(flawCountsFromSlots(slots)).toEqual({ cha: 1 });
  });

  it('ignores free flaw slots (choice flaws — rare)', () => {
    const slots: ParsedSlot[] = [{ kind: 'free', options: ['str', 'dex'] }];
    expect(flawCountsFromSlots(slots)).toEqual({});
  });

  it('returns empty for no slots', () => {
    expect(flawCountsFromSlots([])).toEqual({});
  });
});

describe('disabledKeysForSlot', () => {
  it('disables an ability already at the 4-boost cap', () => {
    const allBoosts = { ...zeroBoosts(), str: BOOST_CAP } as Record<string, number>;
    const disabled = disabledKeysForSlot(0, [null], allBoosts as never, {});
    expect(disabled.has('str')).toBe(true);
    expect(disabled.has('dex')).toBe(false);
  });

  it('allows re-picking the current slot selection even when at cap', () => {
    // str is already at cap, but it's the current pick for slot 0 —
    // keeping it should be allowed (not disabled).
    const allBoosts = { ...zeroBoosts(), str: BOOST_CAP } as Record<string, number>;
    const disabled = disabledKeysForSlot(0, ['str'], allBoosts as never, {});
    expect(disabled.has('str')).toBe(false);
  });

  it('raises the cap by 1 per flaw', () => {
    // cha has 4 boosts but also 1 flaw → cap is 5, so it's not disabled.
    const allBoosts = { ...zeroBoosts(), cha: BOOST_CAP } as Record<string, number>;
    const disabled = disabledKeysForSlot(0, [null], allBoosts as never, { cha: 1 });
    expect(disabled.has('cha')).toBe(false);

    // cha at 5 boosts with 1 flaw → now at cap, disabled.
    const atCapBoosts = { ...zeroBoosts(), cha: BOOST_CAP + 1 } as Record<string, number>;
    const disabledAtCap = disabledKeysForSlot(0, [null], atCapBoosts as never, { cha: 1 });
    expect(disabledAtCap.has('cha')).toBe(true);
  });

  it('disables an ability already picked by a different slot in the same source', () => {
    const allBoosts = zeroBoosts() as Record<string, number>;
    // sourcePicks[0] = 'str'; we're computing disabled for slot 1.
    const disabled = disabledKeysForSlot(1, ['str', null], allBoosts as never, {});
    expect(disabled.has('str')).toBe(true);
    expect(disabled.has('dex')).toBe(false);
  });

  it('does not disable the current slot pick due to same-source rule', () => {
    const allBoosts = { ...zeroBoosts(), str: 1 } as Record<string, number>;
    // Slot 1 currently holds 'str'; it should not be self-blocked.
    const disabled = disabledKeysForSlot(1, ['dex', 'str'], allBoosts as never, {});
    expect(disabled.has('str')).toBe(false);
  });
});
