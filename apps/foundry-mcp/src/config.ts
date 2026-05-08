import { resolve } from 'node:path';
import { homedir } from 'node:os';

export const PORT = parseInt(process.env.PORT ?? '8765', 10);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const COMMAND_TIMEOUT_MS = 30_000;
// FOUNDRY_DATA_DIR: explicit path to Foundry's Data directory (e.g. /data/Data).
// FOUNDRY_DATA: path to the Foundry data root (e.g. /data); Data/ is appended.
// Falls back to ~/foundrydata/Data if neither is set.
export const FOUNDRY_DATA_DIR =
  process.env.FOUNDRY_DATA_DIR ??
  (process.env.FOUNDRY_DATA ? resolve(process.env.FOUNDRY_DATA, 'Data') : resolve(homedir(), 'foundrydata', 'Data'));

// Path to the foundry-mcp SQLite database that stores live-state snapshots
// (inventory, aurus, globe). Defaults to ./data/foundry-mcp.db relative to
// the process working directory.
export const LIVE_DB_PATH = process.env.LIVE_DB_PATH ?? resolve(process.cwd(), 'data', 'foundry-mcp.db');

// Shared secret for bearer-auth on live-state POST endpoints. If unset,
// POSTs are open (acceptable for local-only deployment; log a warning on start).
export const SHARED_SECRET = process.env.SHARED_SECRET;

// Gates POST /api/eval. When off (the default), the route isn't registered
// at all — a request returns 404 with our envelope, indistinguishable from
// an unknown endpoint. When on, arbitrary JS runs in the Foundry page;
// only enable on trusted networks.
export const ALLOW_EVAL = process.env.ALLOW_EVAL === '1';

// Root directory from which /item-art/<filename> is served. If unset,
// the route returns 404 and the rest of the system works normally.
// Set this to the directory containing purchased PF2e item-card PNGs.
// Example: FOUNDRY_MCP_ITEM_ART_DIR=/data/item-art
export const FOUNDRY_MCP_ITEM_ART_DIR = process.env.FOUNDRY_MCP_ITEM_ART_DIR;

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
