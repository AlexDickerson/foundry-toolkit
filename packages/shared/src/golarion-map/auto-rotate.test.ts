import { describe, expect, it } from 'vitest';
import { normalizeLng } from './auto-rotate';

// ---------------------------------------------------------------------------
// normalizeLng — longitude wrapping
// ---------------------------------------------------------------------------

describe('normalizeLng', () => {
  it('leaves values inside [-180, 180) unchanged', () => {
    expect(normalizeLng(0)).toBe(0);
    expect(normalizeLng(90)).toBe(90);
    expect(normalizeLng(-90)).toBe(-90);
    expect(normalizeLng(179.9)).toBeCloseTo(179.9);
    expect(normalizeLng(-179.9)).toBeCloseTo(-179.9);
  });

  it('wraps 180 to -180 (anti-meridian)', () => {
    expect(normalizeLng(180)).toBe(-180);
  });

  it('wraps values just above 180 to just below -180', () => {
    expect(normalizeLng(181)).toBeCloseTo(-179);
  });

  it('wraps values just below -180 to just below 180', () => {
    expect(normalizeLng(-181)).toBeCloseTo(179);
  });

  it('wraps 360 back to 0', () => {
    expect(normalizeLng(360)).toBe(0);
  });

  it('wraps -360 back to 0', () => {
    expect(normalizeLng(-360)).toBe(0);
  });

  it('wraps large positive values (multiple revolutions)', () => {
    // 540 = 360 + 180 → -180
    expect(normalizeLng(540)).toBe(-180);
    // 720 = two full revolutions → 0
    expect(normalizeLng(720)).toBe(0);
    // 810 = 720 + 90 → 90
    expect(normalizeLng(810)).toBeCloseTo(90);
  });

  it('wraps large negative values (multiple revolutions)', () => {
    expect(normalizeLng(-540)).toBe(-180);
    expect(normalizeLng(-720)).toBe(0);
    expect(normalizeLng(-810)).toBeCloseTo(-90);
  });

  it('handles fractional degrees without losing precision', () => {
    expect(normalizeLng(185.5)).toBeCloseTo(-174.5);
    expect(normalizeLng(-185.5)).toBeCloseTo(174.5);
  });
});
