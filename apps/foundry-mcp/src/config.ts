import { resolve } from 'node:path';
import { homedir } from 'node:os';

export const PORT = parseInt(process.env.PORT ?? '8765', 10);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const COMMAND_TIMEOUT_MS = 30_000;
export const FOUNDRY_DATA_DIR = process.env.FOUNDRY_DATA_DIR ?? resolve(homedir(), 'foundrydata', 'Data');

// Gates POST /api/eval. When off (the default), the route isn't registered
// at all — a request returns 404 with our envelope, indistinguishable from
// an unknown endpoint. When on, arbitrary JS runs in the Foundry page;
// only enable on trusted networks.
export const ALLOW_EVAL = process.env.ALLOW_EVAL === '1';

// Comma-separated list of compendium pack ids to pre-fetch on module
// connection. Serves subsequent search/document requests for these
// packs from an in-memory cache, sidestepping the per-item WS
// round-trip. Keep empty to disable entirely.
//
// Example: COMPENDIUM_CACHE_PACK_IDS=pf2e.equipment-srd,pf2e.spells-srd
export const COMPENDIUM_CACHE_PACK_IDS: readonly string[] = (process.env.COMPENDIUM_CACHE_PACK_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
