import { resolve } from 'node:path';
import { homedir } from 'node:os';

export const PORT = parseInt(process.env.PORT ?? '8765', 10);
export const HOST = process.env.HOST ?? '0.0.0.0';
// Bumped from 30s to 60s after observing dump-compendium-pack timing out
// for the heaviest packs (equipment-srd at 5.6k docs, feats-srd at 6k)
// when Foundry is under load. Steady-state these dumps complete in
// ~12-15s, but a busy GM session can push them past 30s.
export const COMMAND_TIMEOUT_MS = 60_000;
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

// Path to the shared pf2e.db SQLite database that holds item_art_overrides
// (and dm-tool's other persistent state). If unset, item art overrides are
// disabled — all items continue to show their default compendium icons.
// On the Mac this DB lives in dm-tool's Electron userData dir; on the server
// set this to wherever you've synced / mounted the DB file.
// Example: PF2E_DB_PATH=/data/dm-tool.db
export const PF2E_DB_PATH = process.env.PF2E_DB_PATH;

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
