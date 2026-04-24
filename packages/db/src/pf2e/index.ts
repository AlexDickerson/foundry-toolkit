// Module-function data layer over pf2e.db — the app-owned SQLite file that
// stores settings, globe pins, party inventory, encounters, Aurus teams, hook
// overrides, pack mappings, and the lazy foundry-mcp document cache.
//
// Compendium content (monsters, items, NPCs, spells, feats …) used to live
// alongside this state in a pre-built SQLite bundle; that surface was
// migrated to foundry-mcp's REST API (see apps/dm-tool/electron/compendium/).
// The only compendium data this file still owns is the lazy document cache
// exported below, which backs graceful degradation during mcp outages.
//
// Module-level singleton: call openPf2eDb(path) once at startup, then use the
// exported functions directly. Not class-based because 41 call sites across
// Electron IPC handlers would rather say `getSetting('x')` than
// `pf2eDb.settings.get('x')`.

export { openPf2eDb, isPf2eDbOpen, closePf2eDb, getPf2eDb } from './connection.js';
export { getSetting, setSetting, deleteSetting, getAllSettings, replaceSettings } from './settings.js';
export { getAdditionalHooksFor, upsertAdditionalHooks } from './hooks.js';
export {
  listPackMappings,
  hasPackMappings,
  replacePackMappings,
  upsertPackMapping,
  renamePackMappings,
} from './packs.js';
export { listGlobePins, upsertGlobePin, deleteGlobePin, setMissionMarkdown, getMissionMarkdown } from './globe.js';
export { listInventory, upsertInventory, deleteInventory } from './inventory.js';
export { listEncounters, upsertEncounter, deleteEncounter } from './combat.js';
export { listAurusTeams, upsertAurusTeam, deleteAurusTeam } from './aurus.js';
export {
  getCachedDocument,
  getCachedDocumentAllowStale,
  putCachedDocument,
  invalidateCachedDocument,
  invalidateAllCachedDocuments,
} from './compendium-cache.js';
export type { CachedDocument } from './compendium-cache.js';
