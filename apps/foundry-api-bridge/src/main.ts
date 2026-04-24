import { ConfigManager } from '@/config/ConfigManager';
import { installPromptInterception } from '@/creator/prompt-intercept';
import { EventChannelController } from '@/events/EventChannelController';
import {
  registerSettings,
  registerMenu,
  getWsUrl,
  getApiKey,
  getAdditionalWsUrls,
  parseServerConfigs,
  type ServerConfig,
} from '@/settings/SettingsManager';
import { Broadcaster, WebSocketClient } from '@/transport';
import {
  CommandRouter,
  rollDiceHandler,
  sendChatMessageHandler,
  rollSkillHandler,
  rollSaveHandler,
  rollAbilityHandler,
  rollAttackHandler,
  rollDamageHandler,
  createActorHandler,
  createActorFromCompendiumHandler,
  updateActorHandler,
  deleteActorHandler,
  adjustActorResourceHandler,
  adjustActorConditionHandler,
  getActorsHandler,
  getActorHandler,
  getPreparedActorHandler,
  getStatisticTraceHandler,
  runScriptHandler,
  getWorldInfoHandler,
  getJournalsHandler,
  getJournalHandler,
  getItemsHandler,
  getItemHandler,
  getCompendiumsHandler,
  getCompendiumHandler,
  findInCompendiumHandler,
  listCompendiumPacksHandler,
  listCompendiumSourcesHandler,
  getCompendiumDocumentHandler,
  dumpCompendiumPackHandler,
  findOrCreateFolderHandler,
  createJournalHandler,
  updateJournalHandler,
  deleteJournalHandler,
  createJournalPageHandler,
  updateJournalPageHandler,
  deleteJournalPageHandler,
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
  createTokenHandler,
  deleteTokenHandler,
  moveTokenHandler,
  moveTokenPathHandler,
  updateTokenHandler,
  getSceneTokensHandler,
  setPatrolHandler,
  stopPatrolHandler,
  getPatrolsHandler,
  getSceneHandler,
  getScenesListHandler,
  activateSceneHandler,
  getActorItemsHandler,
  useItemHandler,
  activateItemHandler,
  addItemToActorHandler,
  addItemFromCompendiumHandler,
  updateActorItemHandler,
  deleteActorItemHandler,
  getActorEffectsHandler,
  toggleActorStatusHandler,
  addActorEffectHandler,
  removeActorEffectHandler,
  updateActorEffectHandler,
  getCombatTurnContextHandler,
  captureSceneHandler,
  createSceneHandler,
  createSceneFromUvttHandler,
  createWallsHandler,
  deleteWallHandler,
  normalizeSceneHandler,
  analyzeSceneHandler,
  getSceneBackgroundHandler,
  updateSceneHandler,
  listRollTablesHandler,
  getRollTableHandler,
  rollOnTableHandler,
  resetTableHandler,
  createRollTableHandler,
  updateRollTableHandler,
  deleteRollTableHandler,
  createSetEventSubscriptionHandler,
  type SetEventSubscriptionParams,
} from '@/commands';

const MODULE_VERSION = '7.7.0';

let wsClients: WebSocketClient[] = [];
let commandRouter: CommandRouter | null = null;

Hooks.once('init', () => {
  registerSettings();
  void registerMenu();
});

// foundry-mcp patch: removed renderSettingsConfig hook that injected a "Get API Key" button opening foundry-mcp.com/auth/patreon. Self-hosted setup has no Patreon flow.

Hooks.once('ready', () => {
  if (!game.user?.isGM) {
    return;
  }

  initializeModule();
});

function initializeModule(): void {
  try {
    ConfigManager.initialize();
    const config = ConfigManager.getConfig();

    const servers = parseServerConfigs(getWsUrl(), getApiKey(), getAdditionalWsUrls());

    if (servers.length === 0) {
      console.log(
        `Foundry API Bridge | v${MODULE_VERSION} loaded. Configure WebSocket URL and API Key in module settings to connect.`,
      );
      return;
    }

    initializeWebSocket(config.webSocket, servers);
    console.log(
      `Foundry API Bridge | v${MODULE_VERSION} initialized (${String(servers.length)} server${servers.length === 1 ? '' : 's'})`,
    );
  } catch (error: unknown) {
    console.error('Foundry API Bridge | Initialization failed:', error);
  }
}

function initializeWebSocket(
  wsConfig: { reconnectInterval: number; maxReconnectAttempts: number },
  servers: readonly ServerConfig[],
): void {
  commandRouter = new CommandRouter();

  // Pull queries
  commandRouter.register('get-world-info', getWorldInfoHandler);
  commandRouter.register('get-actors', getActorsHandler);
  commandRouter.register('get-actor', getActorHandler);
  commandRouter.register('get-prepared-actor', getPreparedActorHandler);
  commandRouter.register('get-statistic-trace', getStatisticTraceHandler);
  commandRouter.register('run-script', runScriptHandler);
  commandRouter.register('get-journals', getJournalsHandler);
  commandRouter.register('get-journal', getJournalHandler);
  commandRouter.register('get-items', getItemsHandler);
  commandRouter.register('get-item', getItemHandler);
  commandRouter.register('get-compendiums', getCompendiumsHandler);
  commandRouter.register('get-compendium', getCompendiumHandler);
  commandRouter.register('find-in-compendium', findInCompendiumHandler);
  commandRouter.register('list-compendium-packs', listCompendiumPacksHandler);
  commandRouter.register('list-compendium-sources', listCompendiumSourcesHandler);
  commandRouter.register('get-compendium-document', getCompendiumDocumentHandler);
  commandRouter.register('dump-compendium-pack', dumpCompendiumPackHandler);
  commandRouter.register('find-or-create-folder', findOrCreateFolderHandler);
  commandRouter.register('get-scene', getSceneHandler);
  commandRouter.register('get-scenes-list', getScenesListHandler);
  commandRouter.register('get-scene-tokens', getSceneTokensHandler);
  commandRouter.register('get-actor-items', getActorItemsHandler);
  commandRouter.register('get-actor-effects', getActorEffectsHandler);
  commandRouter.register('get-combat-state', getCombatStateHandler);
  commandRouter.register('get-combat-turn-context', getCombatTurnContextHandler);

  // Dice & chat
  commandRouter.register('roll-dice', rollDiceHandler);
  commandRouter.register('send-chat-message', sendChatMessageHandler);
  commandRouter.register('roll-skill', rollSkillHandler);
  commandRouter.register('roll-save', rollSaveHandler);
  commandRouter.register('roll-ability', rollAbilityHandler);
  commandRouter.register('roll-attack', rollAttackHandler);
  commandRouter.register('roll-damage', rollDamageHandler);

  // Actor CRUD
  commandRouter.register('create-actor', createActorHandler);
  commandRouter.register('create-actor-from-compendium', createActorFromCompendiumHandler);
  commandRouter.register('update-actor', updateActorHandler);
  commandRouter.register('delete-actor', deleteActorHandler);
  commandRouter.register('adjust-actor-resource', adjustActorResourceHandler);
  commandRouter.register('adjust-actor-condition', adjustActorConditionHandler);

  // Journal CRUD
  commandRouter.register('create-journal', createJournalHandler);
  commandRouter.register('update-journal', updateJournalHandler);
  commandRouter.register('delete-journal', deleteJournalHandler);
  commandRouter.register('create-journal-page', createJournalPageHandler);
  commandRouter.register('update-journal-page', updateJournalPageHandler);
  commandRouter.register('delete-journal-page', deleteJournalPageHandler);

  // Combat
  commandRouter.register('create-combat', createCombatHandler);
  commandRouter.register('add-combatant', addCombatantHandler);
  commandRouter.register('remove-combatant', removeCombatantHandler);
  commandRouter.register('start-combat', startCombatHandler);
  commandRouter.register('end-combat', endCombatHandler);
  commandRouter.register('delete-combat', deleteCombatHandler);
  commandRouter.register('next-turn', nextTurnHandler);
  commandRouter.register('previous-turn', previousTurnHandler);
  commandRouter.register('set-turn', setTurnHandler);
  commandRouter.register('roll-initiative', rollInitiativeHandler);
  commandRouter.register('set-initiative', setInitiativeHandler);
  commandRouter.register('roll-all-initiative', rollAllInitiativeHandler);
  commandRouter.register('update-combatant', updateCombatantHandler);
  commandRouter.register('set-combatant-defeated', setCombatantDefeatedHandler);
  commandRouter.register('toggle-combatant-visibility', toggleCombatantVisibilityHandler);

  // Tokens
  commandRouter.register('create-token', createTokenHandler);
  commandRouter.register('delete-token', deleteTokenHandler);
  commandRouter.register('move-token', moveTokenHandler);
  commandRouter.register('move-token-path', moveTokenPathHandler);
  commandRouter.register('update-token', updateTokenHandler);
  commandRouter.register('set-patrol', setPatrolHandler);
  commandRouter.register('stop-patrol', stopPatrolHandler);
  commandRouter.register('get-patrols', getPatrolsHandler);

  // Items
  commandRouter.register('use-item', useItemHandler);
  commandRouter.register('activate-item', activateItemHandler);
  commandRouter.register('add-item-to-actor', addItemToActorHandler);
  commandRouter.register('add-item-from-compendium', addItemFromCompendiumHandler);
  commandRouter.register('update-actor-item', updateActorItemHandler);
  commandRouter.register('delete-actor-item', deleteActorItemHandler);

  // Effects
  commandRouter.register('toggle-actor-status', toggleActorStatusHandler);
  commandRouter.register('add-actor-effect', addActorEffectHandler);
  commandRouter.register('remove-actor-effect', removeActorEffectHandler);
  commandRouter.register('update-actor-effect', updateActorEffectHandler);

  // Tables
  commandRouter.register('list-roll-tables', listRollTablesHandler);
  commandRouter.register('get-roll-table', getRollTableHandler);
  commandRouter.register('roll-on-table', rollOnTableHandler);
  commandRouter.register('reset-table', resetTableHandler);
  commandRouter.register('create-roll-table', createRollTableHandler);
  commandRouter.register('update-roll-table', updateRollTableHandler);
  commandRouter.register('delete-roll-table', deleteRollTableHandler);

  // Scene actions
  commandRouter.register('activate-scene', activateSceneHandler);
  commandRouter.register('capture-scene', captureSceneHandler);
  commandRouter.register('create-scene', createSceneHandler);
  commandRouter.register('create-scene-from-uvtt', createSceneFromUvttHandler);
  commandRouter.register('create-walls', createWallsHandler);
  commandRouter.register('delete-wall', deleteWallHandler);
  commandRouter.register('normalize-scene', normalizeSceneHandler);
  commandRouter.register('analyze-scene', analyzeSceneHandler);
  commandRouter.register('get-scene-background', getSceneBackgroundHandler);
  commandRouter.register('update-scene', updateSceneHandler);

  wsClients = servers.map(
    (server) =>
      new WebSocketClient({
        url: `${server.url}?apiKey=${encodeURIComponent(server.apiKey)}`,
        reconnectInterval: wsConfig.reconnectInterval,
        maxReconnectAttempts: wsConfig.maxReconnectAttempts,
      }),
  );

  // One controller shared across every client. The Broadcaster fans
  // channel events to whichever clients are currently connected; the
  // controller refcounts subscriptions per-client so one server
  // unsubscribing doesn't drop the hook while another still wants it.
  const broadcaster = new Broadcaster(wsClients);
  const eventChannels = new EventChannelController(broadcaster);

  for (let i = 0; i < wsClients.length; i++) {
    const client = wsClients[i];
    const server = servers[i];
    // Indices line up by construction (wsClients built from servers).
    if (!client || !server) continue;
    const label = describeServer(server);
    const subscriptionHandler = createSetEventSubscriptionHandler(eventChannels, client);

    client.onConnect(() => {
      console.log(`Foundry API Bridge | WebSocket connected (${label})`);
      if (ui.notifications) {
        ui.notifications.info(`Foundry API Bridge | Connected (${label})`);
      }
    });

    client.onDisconnect(() => {
      console.log(`Foundry API Bridge | WebSocket disconnected (${label})`);
      // Drop subscriptions owned by this connection so phantom subs
      // don't keep hooks alive while the server is gone. On reconnect
      // the server re-requests subscription state.
      eventChannels.removeSubscriber(client);
      if (ui.notifications) {
        ui.notifications.warn(`Foundry API Bridge | Disconnected (${label})`);
      }
    });

    client.onMessage((command) => {
      if (!commandRouter) return;

      // set-event-subscription needs per-client identity for the
      // controller's refcount; route it inline instead of through the
      // shared router, which has no notion of which socket sent a
      // command.
      if (command.type === 'set-event-subscription') {
        subscriptionHandler(command.params as SetEventSubscriptionParams)
          .then((data) => {
            client.send({ id: command.id, success: true, data });
          })
          .catch((error: unknown) => {
            client.send({
              id: command.id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      commandRouter
        .execute(command)
        .then((response) => {
          client.send(response);
        })
        .catch((error: unknown) => {
          console.error('Foundry API Bridge | Command execution failed:', error);
        });
    });
  }

  installPromptInterception(wsClients);

  for (const client of wsClients) {
    client.connect();
  }
}

function describeServer(server: ServerConfig): string {
  try {
    const parsed = new URL(server.url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return server.url;
  }
}

export {};
