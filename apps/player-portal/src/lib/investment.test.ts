import { describe, it, expect } from 'vitest';
import type { PhysicalItem, PointPool } from '../api/types';
import { supportsInvestment, wouldExceedInvestmentCap } from './investment';

function makeItem(invested: boolean | null | undefined, traits: string[] = []): PhysicalItem {
  return {
    id: 'item-1',
    name: 'Test Ring',
    type: 'equipment',
    img: 'test.png',
    system: {
      slug: null,
      level: { value: 1 },
      quantity: 1,
      bulk: { value: 0 },
      equipped: {
        carryType: 'worn',
        // exactOptionalPropertyTypes: omit the property entirely when undefined
        ...(invested !== undefined ? { invested } : {}),
      },
      containerId: null,
      traits: { value: traits, rarity: 'common' },
    },
  };
}

function makePool(value: number, max: number): PointPool {
  return { value, max };
}

describe('supportsInvestment', () => {
  it('returns false when invested is null (item does not support investment)', () => {
    expect(supportsInvestment(makeItem(null, ['invested']))).toBe(false);
  });

  it('returns false when invested is undefined (field absent)', () => {
    expect(supportsInvestment(makeItem(undefined, ['invested']))).toBe(false);
  });

  it('returns false when the invested trait is missing even if flag is set', () => {
    expect(supportsInvestment(makeItem(false, []))).toBe(false);
    expect(supportsInvestment(makeItem(true, []))).toBe(false);
  });

  it('returns false when item has other traits but not invested', () => {
    expect(supportsInvestment(makeItem(false, ['magical', 'abjuration']))).toBe(false);
  });

  it('returns true when invested is false and the invested trait is present', () => {
    expect(supportsInvestment(makeItem(false, ['invested']))).toBe(true);
  });

  it('returns true when invested is true and the invested trait is present', () => {
    expect(supportsInvestment(makeItem(true, ['invested']))).toBe(true);
  });

  it('returns true when invested trait is present alongside other traits', () => {
    expect(supportsInvestment(makeItem(false, ['magical', 'invested', 'abjuration']))).toBe(true);
  });
});

describe('wouldExceedInvestmentCap', () => {
  it('returns false when uninvesting an already-invested item, even at full cap', () => {
    const item = makeItem(true, ['invested']);
    expect(wouldExceedInvestmentCap(makePool(10, 10), item)).toBe(false);
  });

  it('returns false when cap is not reached', () => {
    const item = makeItem(false, ['invested']);
    expect(wouldExceedInvestmentCap(makePool(5, 10), item)).toBe(false);
  });

  it('returns false one slot below the cap', () => {
    const item = makeItem(false, ['invested']);
    expect(wouldExceedInvestmentCap(makePool(9, 10), item)).toBe(false);
  });

  it('returns true when current count equals the cap', () => {
    const item = makeItem(false, ['invested']);
    expect(wouldExceedInvestmentCap(makePool(10, 10), item)).toBe(true);
  });

  it('returns true when current count exceeds the cap (defensive)', () => {
    const item = makeItem(false, ['invested']);
    expect(wouldExceedInvestmentCap(makePool(11, 10), item)).toBe(true);
  });
});
