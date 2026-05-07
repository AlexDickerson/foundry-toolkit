import { describe, it, expect } from 'vitest';
import type { PreparedActorItem } from './types';
import { isPhysicalItem } from './types';

// `isPhysicalItem` gates what renders in the Inventory tab and what
// participates in buy/sell flows. pf2e's canonical list
// (src/module/item/physical/values.ts upstream) includes ammo, shield,
// and book alongside the obvious ones. A prior version of this guard
// only covered 6 of the 9, which silently dropped purchased ammo from
// the player-visible inventory.
describe('isPhysicalItem', () => {
  const PHYSICAL: string[] = ['weapon', 'armor', 'shield', 'equipment', 'consumable', 'ammo', 'treasure', 'backpack', 'book'];
  const NON_PHYSICAL: string[] = ['feat', 'action', 'ancestry', 'class', 'heritage', 'lore', 'background', 'spell'];

  for (const type of PHYSICAL) {
    it(`accepts ${type} as a physical item`, () => {
      const item = { id: 'x', name: 'x', type, img: '', system: {} } as unknown as PreparedActorItem;
      expect(isPhysicalItem(item)).toBe(true);
    });
  }

  for (const type of NON_PHYSICAL) {
    it(`rejects ${type} as a non-physical item`, () => {
      const item = { id: 'x', name: 'x', type, img: '', system: {} } as unknown as PreparedActorItem;
      expect(isPhysicalItem(item)).toBe(false);
    });
  }
});
