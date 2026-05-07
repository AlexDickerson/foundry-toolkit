import type { ItemPrice, PreparedActorItem } from '@foundry-toolkit/shared/foundry-api';

export type CarryType = 'worn' | 'held' | 'stowed' | 'dropped';

export interface ItemEquipped {
  carryType: CarryType;
  handsHeld?: number;
  invested?: boolean | null;
  inSlot?: boolean;
}

export interface ItemBulk {
  value: number;
  heldOrStowed?: number;
  per?: number;
  capacity?: number; // containers only
  ignored?: number; // containers only — bulk that doesn't count toward carry limit
}

// Union of fields across physical item subtypes. Specific item types
// (weapon / armor / consumable / etc.) add their own fields on top;
// callers narrow via `item.type`. Index signature lets this subtype
// PreparedActorItem.system cleanly.
export interface PhysicalItemSystem {
  slug: string | null;
  level: { value: number };
  quantity: number;
  bulk: ItemBulk;
  equipped: ItemEquipped;
  containerId: string | null;
  traits: { value: string[]; rarity: string; otherTags?: string[] };
  price?: ItemPrice;
  description?: { value: string };
  category?: string; // "coin" on treasure, "medium" on armor, "martial" on weapon, "potion" on consumable, ...
  damage?: { dice: number; die: string; damageType: string };
  acBonus?: number;
  strength?: number;
  dexCap?: number;
  checkPenalty?: number;
  speedPenalty?: number;
  uses?: { value: number; max: number; autoDestroy?: boolean };
  [key: string]: unknown;
}

// Full set of physical item types in the pf2e system. Sourced from
// pf2e's `src/module/item/physical/values.ts` (PHYSICAL_ITEM_TYPES).
// `ammo`, `shield`, and `book` are distinct top-level types in pf2e
// (not subtypes of consumable/armor/equipment), so they need to be
// listed here or they're silently filtered out of the Inventory tab
// and the Buy/Sell flows.
export type PhysicalItemType =
  | 'weapon'
  | 'armor'
  | 'shield'
  | 'equipment'
  | 'consumable'
  | 'ammo'
  | 'treasure'
  | 'backpack'
  | 'book';

export interface PhysicalItem {
  id: string;
  name: string;
  type: PhysicalItemType;
  img: string;
  system: PhysicalItemSystem;
}

const PHYSICAL_ITEM_TYPES: readonly PhysicalItemType[] = [
  'weapon',
  'armor',
  'shield',
  'equipment',
  'consumable',
  'ammo',
  'treasure',
  'backpack',
  'book',
];

export function isPhysicalItem(item: PreparedActorItem): item is PhysicalItem {
  return (PHYSICAL_ITEM_TYPES as readonly string[]).includes(item.type);
}

export function isCoin(item: PhysicalItem): boolean {
  return item.type === 'treasure' && item.system.category === 'coin';
}

export function isContainer(item: PhysicalItem): boolean {
  return item.type === 'backpack';
}
