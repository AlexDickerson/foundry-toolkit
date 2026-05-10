import { describe, it, expect } from 'vitest';
import { getAncestryArt, getClassArt } from './character-art';

describe('getAncestryArt', () => {
  it('returns the entry for a known ancestry', () => {
    const art = getAncestryArt('Dwarf');
    expect(art).not.toBeNull();
    expect(art!.images.length).toBeGreaterThan(0);
    expect(art!.url).toContain('aonprd.com');
    expect(art!.images[0]).toMatch(/^https:\/\/2e\.aonprd\.com\/Images\/Ancestries\//);
  });

  it('returns the entry for a multi-image ancestry', () => {
    const art = getAncestryArt('Leshy');
    expect(art).not.toBeNull();
    expect(art!.images.length).toBe(4);
  });

  it('falls back to a case-insensitive match', () => {
    const art = getAncestryArt('dwarf');
    expect(art).not.toBeNull();
    expect(art!.id).toBe(getAncestryArt('Dwarf')!.id);
  });

  it('returns null for an unknown ancestry', () => {
    expect(getAncestryArt('NotAnAncestry')).toBeNull();
  });

  it('returns null for an ancestry with zero images (Awakened Animal)', () => {
    // Awakened Animal exists in the JSON but has count 0 — the lookup should
    // treat that the same as "no art available" to keep callers simple.
    expect(getAncestryArt('Awakened Animal')).toBeNull();
  });
});

describe('getClassArt', () => {
  it('returns the iconic-character entry for a known class', () => {
    const art = getClassArt('Wizard');
    expect(art).not.toBeNull();
    expect(art!.images.length).toBe(1);
    expect(art!.images[0]).toMatch(/^https:\/\/2e\.aonprd\.com\/Images\/Classes\/Iconic_/);
  });

  it('returns null for an unknown class', () => {
    expect(getClassArt('NotAClass')).toBeNull();
  });
});
