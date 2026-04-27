import { describe, it, expect } from 'vitest';
import type { PhysicalItem } from '../../../api/types';
import { categoryOf, groupByCategory } from './inventory-categories';

function makeItem(type: PhysicalItem['type'], id: string = type): PhysicalItem {
  return {
    id,
    name: id,
    type,
    img: '',
    system: {
      slug: null,
      level: { value: 0 },
      quantity: 1,
      bulk: { value: 0 },
      equipped: { carryType: 'worn' },
      containerId: null,
      traits: { value: [], rarity: 'common' },
    },
  };
}

describe('categoryOf', () => {
  it.each([
    ['weapon', 'weapons'],
    ['armor', 'armor'],
    ['shield', 'armor'],
    ['consumable', 'consumables'],
    ['ammo', 'consumables'],
    ['equipment', 'equipment'],
    ['backpack', 'containers'],
    ['book', 'books'],
    ['treasure', 'treasure'],
  ] as const)('%s → %s', (type, expected) => {
    expect(categoryOf(type)).toBe(expected);
  });
});

describe('groupByCategory', () => {
  it('buckets items by type', () => {
    const sword = makeItem('weapon', 'sword');
    const armor = makeItem('armor', 'armor');
    const potion = makeItem('consumable', 'potion');
    const map = groupByCategory([sword, armor, potion]);
    expect(map.get('weapons')).toEqual([sword]);
    expect(map.get('armor')).toEqual([armor]);
    expect(map.get('consumables')).toEqual([potion]);
  });

  it('merges shield into armor bucket', () => {
    const shield = makeItem('shield', 'shield');
    const armor = makeItem('armor', 'armor');
    const map = groupByCategory([shield, armor]);
    expect(map.get('armor')).toHaveLength(2);
  });

  it('merges ammo into consumables bucket', () => {
    const arrow = makeItem('ammo', 'arrow');
    const potion = makeItem('consumable', 'potion');
    const map = groupByCategory([arrow, potion]);
    expect(map.get('consumables')).toHaveLength(2);
  });

  it('preserves insertion order within a bucket', () => {
    const s1 = makeItem('weapon', 'sword1');
    const s2 = makeItem('weapon', 'sword2');
    const map = groupByCategory([s1, s2]);
    expect(map.get('weapons')).toEqual([s1, s2]);
  });

  it('returns empty map for empty input', () => {
    expect(groupByCategory([])).toEqual(new Map());
  });
});
