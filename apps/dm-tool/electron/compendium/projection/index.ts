// Barrel re-export — exposes the same public surface as the former
// monolithic projection.ts so all existing import sites continue to work
// by pointing at `./projection/index.js`.

export {
  monsterDocToResult,
  monsterDocToRow,
  monsterDocToDetail,
  monsterMatchToSummary,
  type MonsterRow,
  type MonsterResult,
} from './monster.js';
export { priceToCopper, itemDocToBrowserDetail, itemMatchToBrowserRow } from './item.js';
