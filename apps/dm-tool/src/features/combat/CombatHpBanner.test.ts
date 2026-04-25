import { describe, expect, it } from 'vitest';
import { hpColor } from './CombatHpBanner';

describe('hpColor', () => {
  it('returns green above 60%', () => {
    expect(hpColor(7, 10)).toBe('#4ade80'); // 70%
    expect(hpColor(10, 10)).toBe('#4ade80'); // 100%
    expect(hpColor(61, 100)).toBe('#4ade80'); // 61%
  });

  it('returns yellow between 30% and 60% (inclusive)', () => {
    expect(hpColor(6, 10)).toBe('#facc15'); // 60% — not > 60, so yellow
    expect(hpColor(5, 10)).toBe('#facc15'); // 50%
    expect(hpColor(31, 100)).toBe('#facc15'); // 31%
  });

  it('returns red at 30% and below', () => {
    expect(hpColor(3, 10)).toBe('#f87171'); // 30% — not > 30, so red
    expect(hpColor(2, 10)).toBe('#f87171'); // 20%
    expect(hpColor(0, 10)).toBe('#f87171'); // 0%
  });

  it('returns red when maxHp is 0 (avoids division by zero)', () => {
    expect(hpColor(5, 0)).toBe('#f87171');
    expect(hpColor(0, 0)).toBe('#f87171');
  });

  it('clamps negative hp to 0% (red)', () => {
    expect(hpColor(-5, 10)).toBe('#f87171');
  });

  it('clamps hp above maxHp to 100% (green)', () => {
    expect(hpColor(15, 10)).toBe('#4ade80');
  });
});
