// Process-wide singleton for the compendium cache plus the warm-up
// hook. Split from compendium-cache.ts so the class itself stays
// testable without pulling in the bridge module.

import { COMPENDIUM_CACHE_PACK_IDS } from '../config.js';
import { onFoundryConnect, sendCommand } from '../bridge.js';
import { log } from '../logger.js';
import { CompendiumCache } from './compendium-cache.js';

export const compendiumCache = new CompendiumCache(sendCommand);

let registered = false;

// Called once at server start. Subscribes the cache to module-
// connection events so each (re)connect triggers a fresh warm of the
// configured packs. No-op when COMPENDIUM_CACHE_PACK_IDS is empty.
export function registerCompendiumCacheWarming(): void {
  if (registered) return;
  if (COMPENDIUM_CACHE_PACK_IDS.length === 0) {
    log.info('compendium-cache: no packs configured — cache disabled');
    return;
  }
  registered = true;
  log.info(`compendium-cache: configured for ${COMPENDIUM_CACHE_PACK_IDS.join(', ')}`);
  onFoundryConnect(() => {
    log.info('compendium-cache: module connected — warming');
    compendiumCache.clear();
    void compendiumCache.warmAll(COMPENDIUM_CACHE_PACK_IDS);
  });
}
