import { describe, it, expect } from 'vitest';
import type { CompendiumMatch } from '@/features/characters/types';
import { groupHeritages } from './helpers';

function makeHeritage(name: string, isVersatile?: boolean): CompendiumMatch {
  return {
    packId: 'pf2e.heritages',
    packLabel: 'Heritages',
    documentId: `heritage-${name.toLowerCase().replace(/\s/g, '-')}`,
    uuid: `Compendium.pf2e.heritages.Item.${name}`,
    name,
    type: 'heritage',
    img: '',
    ...(isVersatile !== undefined ? { isVersatile } : {}),
  };
}

describe('groupHeritages', () => {
  it('puts items without isVersatile in primary', () => {
    const items = [makeHeritage('Ancient Dwarf'), makeHeritage('Death Warden Dwarf')];
    const { primary, versatile } = groupHeritages(items);
    expect(primary).toHaveLength(2);
    expect(versatile).toHaveLength(0);
  });

  it('puts isVersatile=true items in versatile', () => {
    const items = [makeHeritage('Aiuvarin', true), makeHeritage('Changeling', true)];
    const { primary, versatile } = groupHeritages(items);
    expect(primary).toHaveLength(0);
    expect(versatile).toHaveLength(2);
  });

  it('puts isVersatile=false items in primary', () => {
    const item = makeHeritage('Ancient Dwarf', false);
    const { primary, versatile } = groupHeritages([item]);
    expect(primary).toHaveLength(1);
    expect(versatile).toHaveLength(0);
  });

  it('splits a mixed list correctly', () => {
    const items = [
      makeHeritage('Ancient Dwarf'),
      makeHeritage('Aiuvarin', true),
      makeHeritage('Death Warden Dwarf'),
      makeHeritage('Changeling', true),
      makeHeritage('Strong-Blooded Dwarf'),
    ];
    const { primary, versatile } = groupHeritages(items);
    expect(primary.map((m) => m.name)).toEqual(['Ancient Dwarf', 'Death Warden Dwarf', 'Strong-Blooded Dwarf']);
    expect(versatile.map((m) => m.name)).toEqual(['Aiuvarin', 'Changeling']);
  });

  it('returns empty groups for an empty list', () => {
    const { primary, versatile } = groupHeritages([]);
    expect(primary).toHaveLength(0);
    expect(versatile).toHaveLength(0);
  });

  it('preserves order within each group', () => {
    const items = [
      makeHeritage('Nephilim', true),
      makeHeritage('Ancient Dwarf'),
      makeHeritage('Aiuvarin', true),
      makeHeritage('Strong-Blooded Dwarf'),
    ];
    const { primary, versatile } = groupHeritages(items);
    expect(primary[0]?.name).toBe('Ancient Dwarf');
    expect(primary[1]?.name).toBe('Strong-Blooded Dwarf');
    expect(versatile[0]?.name).toBe('Nephilim');
    expect(versatile[1]?.name).toBe('Aiuvarin');
  });
});
