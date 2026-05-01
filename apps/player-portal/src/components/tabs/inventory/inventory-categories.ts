import type { PhysicalItem, PhysicalItemType } from '../../../api/types';

export type InventoryCategory =
  | 'weapons'
  | 'armor'
  | 'consumables'
  | 'equipment'
  | 'containers'
  | 'books'
  | 'treasure';

export type ViewMode = 'list' | 'grid';
export type ShopView = 'inventory' | 'shop' | 'party-stash';

// Category buckets for the inventory separators. Related pf2e item
// types share a bucket ("Armor & Shields", "Consumables" holds ammo)
// so the player sees a familiar grouping rather than one header per
// strict Foundry type. Order matches how players typically scan:
// weapons and defenses first, then expendables, then everything else.
export const CATEGORY_ORDER: readonly InventoryCategory[] = [
  'weapons',
  'armor',
  'consumables',
  'equipment',
  'containers',
  'books',
  'treasure',
];

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  weapons: 'Weapons',
  armor: 'Armor & Shields',
  consumables: 'Consumables',
  equipment: 'Equipment',
  containers: 'Containers',
  books: 'Books',
  treasure: 'Treasure',
};

export function categoryOf(type: PhysicalItemType): InventoryCategory {
  switch (type) {
    case 'weapon':
      return 'weapons';
    case 'armor':
    case 'shield':
      return 'armor';
    case 'consumable':
    case 'ammo':
      return 'consumables';
    case 'equipment':
      return 'equipment';
    case 'backpack':
      return 'containers';
    case 'book':
      return 'books';
    case 'treasure':
      return 'treasure';
  }
}

export function groupByCategory(items: readonly PhysicalItem[]): Map<InventoryCategory, PhysicalItem[]> {
  const out = new Map<InventoryCategory, PhysicalItem[]>();
  for (const item of items) {
    const cat = categoryOf(item.type);
    const arr = out.get(cat) ?? [];
    arr.push(item);
    out.set(cat, arr);
  }
  return out;
}
