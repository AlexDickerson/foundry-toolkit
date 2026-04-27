// Barrel re-export — exposes the same public surface as the former
// monolithic projection.ts so all existing import sites continue to work
// by pointing at `./projection/index.js`.

export { cleanDescription } from './shared.js';
export {
  formatMelee,
  formatRanged,
  formatActions,
  formatImmunities,
  formatWeaknesses,
  formatSpeed,
  monsterSpells,
  monsterDocToResult,
  monsterDocToRow,
  monsterDocToDetail,
  monsterDocToSummary,
  monsterMatchToSummary,
  type MonsterRow,
  type MonsterResult,
} from './monster.js';
export {
  formatPriceStructured,
  priceToCopper,
  itemDocToBrowserRow,
  itemDocToBrowserDetail,
  itemMatchToBrowserRow,
  itemDocToLootShortlistItem,
} from './item.js';
