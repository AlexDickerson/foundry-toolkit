export { rollDiceHandler } from '@/commands/handlers/RollDiceHandler';
export { sendChatMessageHandler } from '@/commands/handlers/SendChatMessageHandler';
export { runScriptHandler } from '@/commands/handlers/RunScriptHandler';
export { fetchAssetHandler } from '@/commands/handlers/FetchAssetHandler';

// Actor handlers
export {
  createActorHandler,
  createActorFromCompendiumHandler,
  updateActorHandler,
  deleteActorHandler,
  invokeActorActionHandler,
  KNOWN_ACTIONS,
  getActorsHandler,
  getActorHandler,
  getPreparedActorHandler,
  getStatisticTraceHandler,
  getPartyMembersHandler,
  getPartyForMemberHandler,
  getPartyStashHandler,
} from '@/commands/handlers/actor';

// Journal handlers
export {
  createJournalHandler,
  updateJournalHandler,
  deleteJournalHandler,
  createJournalPageHandler,
  updateJournalPageHandler,
  deleteJournalPageHandler,
  getJournalsHandler,
  getJournalHandler,
} from '@/commands/handlers/journal';

// Combat handlers
export {
  createCombatHandler,
  addCombatantHandler,
  removeCombatantHandler,
  startCombatHandler,
  endCombatHandler,
  deleteCombatHandler,
  nextTurnHandler,
  previousTurnHandler,
  getCombatStateHandler,
  setTurnHandler,
  rollInitiativeHandler,
  setInitiativeHandler,
  rollAllInitiativeHandler,
  updateCombatantHandler,
  setCombatantDefeatedHandler,
  toggleCombatantVisibilityHandler,
  getCombatTurnContextHandler,
} from '@/commands/handlers/combat';

// Token handlers
export {
  createTokenHandler,
  deleteTokenHandler,
  moveTokenHandler,
  moveTokenPathHandler,
  updateTokenHandler,
  getSceneTokensHandler,
  setPatrolHandler,
  stopPatrolHandler,
  getPatrolsHandler,
} from '@/commands/handlers/token';

// Item handlers
export {
  getActorItemsHandler,
  useItemHandler,
  activateItemHandler,
  addItemToActorHandler,
  addItemFromCompendiumHandler,
  updateActorItemHandler,
  deleteActorItemHandler,
  getItemsHandler,
  getItemHandler,
} from '@/commands/handlers/item';

// Scene handlers
export {
  getSceneHandler,
  getScenesListHandler,
  activateSceneHandler,
  captureSceneHandler,
  createSceneHandler,
  createSceneFromUvttHandler,
  createWallsHandler,
  deleteWallHandler,
  normalizeSceneHandler,
  analyzeSceneHandler,
  getSceneBackgroundHandler,
  updateSceneHandler,
} from '@/commands/handlers/scene';

// World handlers
export {
  getWorldInfoHandler,
  getCompendiumsHandler,
  getCompendiumHandler,
  findInCompendiumHandler,
  listCompendiumPacksHandler,
  listCompendiumSourcesHandler,
  getCompendiumDocumentHandler,
  dumpCompendiumPackHandler,
  findOrCreateFolderHandler,
} from '@/commands/handlers/world';

// Table handlers
export {
  listRollTablesHandler,
  getRollTableHandler,
  rollOnTableHandler,
  resetTableHandler,
  createRollTableHandler,
  updateRollTableHandler,
  deleteRollTableHandler,
} from '@/commands/handlers/table';

// Effect handlers
export {
  getActorEffectsHandler,
  toggleActorStatusHandler,
  addActorEffectHandler,
  removeActorEffectHandler,
  updateActorEffectHandler,
} from '@/commands/handlers/effect';

// Event channel handlers
export { createSetEventSubscriptionHandler } from '@/commands/handlers/events';

// Generic Foundry dispatcher (Layer 0)
export { dispatchHandler } from '@/commands/handlers/dispatch';
