import type { TabDef } from './types';

export const BROWSER_TAB: TabDef = { id: 'browser', kind: 'browser' };

// Order systems / categories deterministically in the sidebar. Items
// not in the list sort to the end (their `indexOf` returns -1, which
// the sort comparator clamps to 999).
export const SYSTEM_ORDER = ['PF2e', '5e', 'Generic'];

export const CATEGORY_ORDER = [
  'Rulebook',
  'Adventure Path',
  'Adventure',
  'Setting',
  'Supplement',
  'Rulebooks',
  'Adventure Paths',
  'Adventures',
  'Lost Omens',
  'Beginner Box',
];

// Catalog-grid card sizing — consumed by both `cards.tsx` (chip
// dimensions) and `CatalogGrid.tsx` (virtualizer row height + grid
// template). Kept together so changing one keeps both in sync.
export const CARD_WIDTH = 160;
export const CARD_HEIGHT = 240;
export const GAP = 12;
export const SECTION_HEIGHT = 36;
