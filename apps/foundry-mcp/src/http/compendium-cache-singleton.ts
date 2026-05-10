// Process-wide singleton for the compendium cache plus the warm-up
// hook. Split from compendium-cache.ts so the class itself stays
// testable without pulling in the bridge module.

import { COMPENDIUM_CACHE_DB_PATH, COMPENDIUM_CACHE_PACK_IDS } from '../config.js';
import { onFoundryConnect, sendCommand } from '../bridge.js';
import { CompendiumDb } from '../db/compendium-db.js';
import { log } from '../logger.js';
import { CompendiumCache } from './compendium-cache.js';

const compendiumDb = new CompendiumDb(COMPENDIUM_CACHE_DB_PATH);
export const compendiumCache = new CompendiumCache(sendCommand, compendiumDb);

let registered = false;

// Called once at server start. Subscribes the cache to module-connection
// events. On each connect, packs already in the disk cache are loaded
// instantly from disk; only packs with no disk entry trigger a bridge warm.
// No-op when COMPENDIUM_CACHE_PACK_IDS is empty.
export function registerCompendiumCacheWarming(): void {
  if (registered) return;
  if (COMPENDIUM_CACHE_PACK_IDS.length === 0) {
    log.info('compendium-cache: no packs configured — cache disabled');
    return;
  }
  registered = true;
  log.info(`compendium-cache: configured for ${COMPENDIUM_CACHE_PACK_IDS.join(', ')}`);
  onFoundryConnect(() => {
    log.info('compendium-cache: module connected — loading from disk cache');
    const uncached = compendiumCache.loadCachedPacks(COMPENDIUM_CACHE_PACK_IDS);
    if (uncached.length === 0) {
      log.info('compendium-cache: all packs served from disk cache');
      return;
    }
    log.info(`compendium-cache: warming ${uncached.length.toString()} uncached packs from bridge`);
    void compendiumCache.warmAll(uncached);
  });
}
