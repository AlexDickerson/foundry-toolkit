// Preload script — the only module with access to both Node APIs and the
// renderer's window. Exposes a narrow, typed surface via contextBridge so
// the React code never sees ipcRenderer directly.
//
// Every method exposed here must be named identically to the corresponding
// ipcMain.handle() call in ipc.ts. Changes here must be mirrored in
// src/vite-env.d.ts which declares `window.electronAPI` for TypeScript.

import { contextBridge, ipcRenderer } from 'electron';
import type {
  CompendiumItemPayload,
  CreateCompendiumItemResponse,
  EnsureCompendiumPackBody,
  EnsureCompendiumPackResponse,
} from '@foundry-toolkit/shared/rpc';
import type { CompendiumItemTemplate } from './ipc/homebrew-items-clone.js';
import type { ElectronAPI } from './ipc/types.js';
import type {
  ActorSpellcasting,
  ActorUpdate,
  AonPreviewData,
  AurusTeam,
  Book,
  BookClassifyProgress,
  BookScanResult,
  ChatChunk,
  ChatMessage,
  ChatModel,
  CombatantInitiativeEvent,
  CompendiumPackSummary,
  ConfigPaths,
  Encounter,
  Facets,
  FinalizeIngestArgs,
  GlobePin,
  ItemBrowserDetail,
  ItemBrowserRow,
  ItemFacets,
  ItemSearchParams,
  LootItem,
  MapDetail,
  MapSummary,
  MissionData,
  MonsterDetail,
  MonsterFacets,
  MonsterSearchParams,
  MonsterSummary,
  PartyInventoryItem,
  PartyMember,
  PickPathArgs,
  PushEncounterResult,
  SearchParams,
  TaggerProgress,
  TaggerResult,
  TaggerRunArgs,
} from '@foundry-toolkit/shared/types';

const api: ElectronAPI = {
  // Secure storage
  secureStore: (key: string, value: string): Promise<void> => ipcRenderer.invoke('secureStore', key, value),
  secureLoad: (key: string): Promise<string> => ipcRenderer.invoke('secureLoad', key),
  secureDelete: (key: string): Promise<void> => ipcRenderer.invoke('secureDelete', key),

  // App mode + config
  getAppMode: (): Promise<'normal' | 'setup'> => ipcRenderer.invoke('getAppMode'),
  getConfig: (): Promise<ConfigPaths> => ipcRenderer.invoke('getConfig'),
  pickPath: (args: PickPathArgs): Promise<string | null> => ipcRenderer.invoke('pickPath', args),
  saveConfigAndRestart: (paths: ConfigPaths): Promise<void> => ipcRenderer.invoke('saveConfigAndRestart', paths),

  // Maps
  searchMaps: (params: SearchParams): Promise<MapSummary[]> => ipcRenderer.invoke('searchMaps', params),
  getMapDetail: (fileName: string): Promise<MapDetail | null> => ipcRenderer.invoke('getMapDetail', fileName),
  getFacets: (): Promise<Facets> => ipcRenderer.invoke('getFacets'),
  getLibraryPath: (): Promise<string> => ipcRenderer.invoke('getLibraryPath'),
  openInExplorer: (fileName: string): Promise<void> => ipcRenderer.invoke('openInExplorer', fileName),
  setTitleBarOverlayHeight: (height: number): Promise<void> => ipcRenderer.invoke('setTitleBarOverlayHeight', height),
  regenerateEncounterHooks: (args: { fileName: string; apiKey: string }): Promise<string[]> =>
    ipcRenderer.invoke('regenerateEncounterHooks', args),

  // Chat
  chatSend: (args: {
    messages: ChatMessage[];
    apiKey: string;
    model?: ChatModel;
    toolContext?: string;
    rulesMode?: boolean;
  }): Promise<void> => ipcRenderer.invoke('chatSend', args),
  getToolPageContent: (toolUrl: string): Promise<string> => ipcRenderer.invoke('getToolPageContent', toolUrl),
  onChatChunk: (callback: (chunk: ChatChunk) => void): (() => void) => {
    const handler = (_event: unknown, chunk: ChatChunk) => callback(chunk);
    ipcRenderer.on('chat-chunk', handler);
    return () => ipcRenderer.removeListener('chat-chunk', handler);
  },

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('openExternal', url),
  aonPreview: (urlPath: string): Promise<AonPreviewData | null> => ipcRenderer.invoke('aonPreview', urlPath),

  // Book catalog + reader
  booksScan: (): Promise<BookScanResult> => ipcRenderer.invoke('booksScan'),
  booksList: (): Promise<Book[]> => ipcRenderer.invoke('booksList'),
  booksGet: (id: number): Promise<Book | null> => ipcRenderer.invoke('booksGet', id),
  booksFinalizeIngest: (args: FinalizeIngestArgs): Promise<Book> => ipcRenderer.invoke('booksFinalizeIngest', args),
  booksGetFileUrl: (id: number): Promise<string> => ipcRenderer.invoke('booksGetFileUrl', id),
  booksGetCoverUrl: (id: number): Promise<string> => ipcRenderer.invoke('booksGetCoverUrl', id),
  booksUpdateMeta: (args: {
    id: number;
    fields: { aiSystem?: string; aiCategory?: string; aiSubcategory?: string | null; aiPublisher?: string | null };
  }): Promise<Book | null> => ipcRenderer.invoke('booksUpdateMeta', args),
  booksClassify: (args: { apiKey: string; reclassify?: boolean }): Promise<void> =>
    ipcRenderer.invoke('booksClassify', args),
  booksClassifyCancel: (): Promise<void> => ipcRenderer.invoke('booksClassifyCancel'),
  onBookClassifyProgress: (callback: (p: BookClassifyProgress) => void): (() => void) => {
    const handler = (_event: unknown, p: BookClassifyProgress) => callback(p);
    ipcRenderer.on('book-classify-progress', handler);
    return () => ipcRenderer.removeListener('book-classify-progress', handler);
  },

  // Map tagger
  taggerAvailable: (): Promise<boolean> => ipcRenderer.invoke('taggerAvailable'),
  taggerPickSource: (): Promise<string | null> => ipcRenderer.invoke('taggerPickSource'),
  taggerPreview: (args: TaggerRunArgs): Promise<TaggerResult> => ipcRenderer.invoke('taggerPreview', args),
  taggerIngest: (args: TaggerRunArgs): Promise<TaggerResult> => ipcRenderer.invoke('taggerIngest', args),
  taggerCancel: (): Promise<boolean> => ipcRenderer.invoke('taggerCancel'),
  taggerIsRunning: (): Promise<boolean> => ipcRenderer.invoke('taggerIsRunning'),
  onTaggerProgress: (callback: (p: TaggerProgress) => void): (() => void) => {
    const handler = (_event: unknown, p: TaggerProgress) => callback(p);
    ipcRenderer.on('tagger-progress', handler);
    return () => ipcRenderer.removeListener('tagger-progress', handler);
  },

  // Pack grouping
  getPackMapping: (): Promise<Record<string, string> | null> => ipcRenderer.invoke('getPackMapping'),
  exportPackGroupingPrompt: (): Promise<string> => ipcRenderer.invoke('exportPackGroupingPrompt'),
  importPackMappingFromFile: (): Promise<Record<string, string> | null> =>
    ipcRenderer.invoke('importPackMappingFromFile'),
  mergePacks: (args: { sourcePacks: string[]; targetName: string }): Promise<Record<string, string>> =>
    ipcRenderer.invoke('mergePacks', args),

  // Item browser
  searchItemsBrowser: (params: ItemSearchParams): Promise<ItemBrowserRow[]> =>
    ipcRenderer.invoke('searchItemsBrowser', params),
  getItemBrowserDetail: (id: string): Promise<ItemBrowserDetail | null> =>
    ipcRenderer.invoke('getItemBrowserDetail', id),
  getItemFacets: (): Promise<ItemFacets> => ipcRenderer.invoke('getItemFacets'),

  // Homebrew item creator
  getCompendiumItemTemplate: (uuid: string): Promise<CompendiumItemTemplate> =>
    ipcRenderer.invoke('getCompendiumItemTemplate', uuid),
  ensureHomebrewItemPack: (body: EnsureCompendiumPackBody): Promise<EnsureCompendiumPackResponse> =>
    ipcRenderer.invoke('ensureHomebrewItemPack', body),
  createHomebrewItem: (payload: {
    packId: string;
    item: CompendiumItemPayload;
  }): Promise<CreateCompendiumItemResponse> => ipcRenderer.invoke('createHomebrewItem', payload),

  // Monster browser
  monstersSearch: (params: MonsterSearchParams): Promise<MonsterSummary[]> =>
    ipcRenderer.invoke('monstersSearch', params),
  monstersFacets: (): Promise<MonsterFacets> => ipcRenderer.invoke('monstersFacets'),
  monstersGetDetail: (name: string): Promise<MonsterDetail | null> => ipcRenderer.invoke('monstersGetDetail', name),

  // Compendium configuration (Settings → Monsters)
  compendiumListPacks: (documentType?: string): Promise<CompendiumPackSummary[]> =>
    ipcRenderer.invoke('compendiumListPacks', documentType),
  compendiumGetMonsterPackIds: (): Promise<string[]> => ipcRenderer.invoke('compendiumGetMonsterPackIds'),
  compendiumSetMonsterPackIds: (ids: string[]): Promise<string[]> =>
    ipcRenderer.invoke('compendiumSetMonsterPackIds', ids),
  compendiumGetDefaultMonsterPackIds: (): Promise<string[]> => ipcRenderer.invoke('compendiumGetDefaultMonsterPackIds'),

  // Globe pins
  globePinsList: (): Promise<GlobePin[]> => ipcRenderer.invoke('globePinsList'),
  globePinsUpsert: (pin: GlobePin): Promise<void> => ipcRenderer.invoke('globePinsUpsert', pin),
  globePinsDelete: (id: string): Promise<void> => ipcRenderer.invoke('globePinsDelete', id),
  globePinOpenNote: (pin: GlobePin): Promise<boolean> => ipcRenderer.invoke('globePinOpenNote', pin),
  globePinGetMission: (pin: GlobePin): Promise<MissionData | null> => ipcRenderer.invoke('globePinGetMission', pin),
  globePinLinkNote: (pin: GlobePin): Promise<GlobePin | null> => ipcRenderer.invoke('globePinLinkNote', pin),
  globeExportPlayerData: (): Promise<boolean> => ipcRenderer.invoke('globeExportPlayerData'),

  // Party inventory (DM-local storage for party loot via LootPanel)
  inventoryList: (): Promise<PartyInventoryItem[]> => ipcRenderer.invoke('inventoryList'),
  inventoryUpsert: (item: PartyInventoryItem): Promise<void> => ipcRenderer.invoke('inventoryUpsert', item),
  inventoryDelete: (id: string): Promise<void> => ipcRenderer.invoke('inventoryDelete', id),

  // Aurus leaderboard (live-synced via sidecar)
  aurusList: (): Promise<AurusTeam[]> => ipcRenderer.invoke('aurusList'),
  aurusUpsert: (team: AurusTeam): Promise<void> => ipcRenderer.invoke('aurusUpsert', team),
  aurusDelete: (id: string): Promise<void> => ipcRenderer.invoke('aurusDelete', id),

  // Combat tracker (DM-side only — no sidecar push)
  onActorUpdated: (callback: (update: ActorUpdate) => void): (() => void) => {
    const handler = (_event: unknown, update: ActorUpdate) => callback(update);
    ipcRenderer.on('actor-updated', handler);
    return () => ipcRenderer.removeListener('actor-updated', handler);
  },
  pushActorHp: (actorId: string, hp: number, maxHp?: number): Promise<void> =>
    ipcRenderer.invoke('pushActorHp', actorId, hp, maxHp),
  encountersList: (): Promise<Encounter[]> => ipcRenderer.invoke('encountersList'),
  encountersUpsert: (enc: Encounter): Promise<void> => ipcRenderer.invoke('encountersUpsert', enc),
  encountersDelete: (id: string): Promise<void> => ipcRenderer.invoke('encountersDelete', id),
  generateEncounterLoot: (args: { encounter: Encounter; partyLevel: number; apiKey: string }): Promise<LootItem[]> =>
    ipcRenderer.invoke('generateEncounterLoot', args),
  pushEncounterToFoundry: (encounterId: string): Promise<PushEncounterResult> =>
    ipcRenderer.invoke('pushEncounterToFoundry', encounterId),
  listPartyMembers: (): Promise<PartyMember[]> => ipcRenderer.invoke('listPartyMembers'),
  getActorSpellcasting: (actorId: string): Promise<ActorSpellcasting | null> =>
    ipcRenderer.invoke('getActorSpellcasting', actorId),
  onCombatantInitiativeUpdate: (callback: (event: CombatantInitiativeEvent) => void): (() => void) => {
    const handler = (_event: unknown, update: CombatantInitiativeEvent) => callback(update);
    ipcRenderer.on('combatant-initiative-update', handler);
    return () => ipcRenderer.removeListener('combatant-initiative-update', handler);
  },

  // Auto-Wall
  autoWallAvailable: (): Promise<boolean> => ipcRenderer.invoke('autoWallAvailable'),
  autoWallLaunch: (fileName: string): Promise<void> => ipcRenderer.invoke('autoWallLaunch', fileName),
  autoWallHasUvtt: (fileName: string): Promise<boolean> => ipcRenderer.invoke('autoWallHasUvtt', fileName),
  autoWallGetWalls: (fileName: string): Promise<{ walls: number[][]; width: number; height: number } | null> =>
    ipcRenderer.invoke('autoWallGetWalls', fileName),
  autoWallImportUvtt: (fileName: string): Promise<boolean> => ipcRenderer.invoke('autoWallImportUvtt', fileName),
  getMapUvtt: (fileName: string): Promise<Record<string, unknown> | null> => ipcRenderer.invoke('getMapUvtt', fileName),
  pushToFoundry: (
    fileName: string,
  ): Promise<{ sceneId: string; sceneName: string; wallsCreated: number; doorsCreated: number }> =>
    ipcRenderer.invoke('pushToFoundry', fileName),
};

contextBridge.exposeInMainWorld('electronAPI', api);
