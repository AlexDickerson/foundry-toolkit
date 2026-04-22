import { describe, it, expect } from 'vitest';
import amiri from '../fixtures/amiri-prepared.json';
import type { PreparedActorItem } from '../api/types';
import { coinItemsByDenom, cpToDenominations, formatCp, priceToCp, sumActorCoinsCp } from './coins';

const items = (amiri as unknown as { items: PreparedActorItem[] }).items;

describe('priceToCp', () => {
  it('sums all denominations correctly', () => {
    expect(priceToCp({ value: { gp: 1 } })).toBe(100);
    expect(priceToCp({ value: { pp: 1 } })).toBe(1000);
    expect(priceToCp({ value: { sp: 1 } })).toBe(10);
    expect(priceToCp({ value: { cp: 1 } })).toBe(1);
    expect(priceToCp({ value: { pp: 1, gp: 2, sp: 3, cp: 4 } })).toBe(1234);
  });

  it('honours the `per` field for stack prices', () => {
    // 4 gp for a stack of 10 arrows = 0.4 gp each = 40 cp each.
    expect(priceToCp({ value: { gp: 4 }, per: 10 })).toBe(40);
  });

  it('returns 0 for undefined / malformed price', () => {
    expect(priceToCp(undefined)).toBe(0);
    expect(priceToCp(null)).toBe(0);
    expect(priceToCp({ value: {} })).toBe(0);
  });
});

describe('cpToDenominations', () => {
  it('breaks down a cp total into largest-first denominations', () => {
    expect(cpToDenominations(1234)).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
    expect(cpToDenominations(100)).toEqual({ pp: 0, gp: 1, sp: 0, cp: 0 });
    expect(cpToDenominations(0)).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
  });

  it('floors fractional cp so denominations stay integral', () => {
    expect(cpToDenominations(99.9)).toEqual({ pp: 0, gp: 0, sp: 9, cp: 9 });
  });
});

describe('sumActorCoinsCp / coinItemsByDenom (Amiri fixture)', () => {
  it('totals Amiri 5 sp + 6 gp = 650 cp', () => {
    expect(sumActorCoinsCp(items)).toBe(650);
  });

  it('indexes coin items by denomination', () => {
    const byDenom = coinItemsByDenom(items);
    expect(byDenom.gp?.name).toBe('Gold Pieces');
    expect(byDenom.gp?.system.quantity).toBe(6);
    expect(byDenom.sp?.name).toBe('Silver Pieces');
    expect(byDenom.sp?.system.quantity).toBe(5);
    expect(byDenom.pp).toBeUndefined();
    expect(byDenom.cp).toBeUndefined();
  });
});

describe('formatCp', () => {
  it('renders the largest-first breakdown, skipping zero denominations', () => {
    expect(formatCp(1234)).toBe('1 pp 2 gp 3 sp 4 cp');
    expect(formatCp(100)).toBe('1 gp');
    expect(formatCp(0)).toBe('0 cp');
  });
});
