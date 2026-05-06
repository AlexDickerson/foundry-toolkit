/** The IPC surface exposed to the renderer via contextBridge. Every
 *  function here must have a corresponding handler registered in ipc.ts
 *  and a corresponding type declaration on `window.electronAPI` in the
 *  renderer's global types (src/vite-env.d.ts). */
import type {
  CompendiumItemPayload,
  CreateCompendiumItemResponse,
  EnsureCompendiumPackBody,
  EnsureCompendiumPackResponse,
} from '@foundry-toolkit/shared/rpc';
import type { CompendiumItemTemplate } from './homebrew-items-clone.js';
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
} from '@foundry-toolkit/shared';

export interface ElectronAPI {
  // -----------------------------------------------------------------------
  // Secure storage (OS keychain-backed via Electron safeStorage)
  // -----------------------------------------------------------------------
  secureStore(key: string, value: string): Promise<void>;
  secureLoad(key: string): Promise<string>;
  secureDelete(key: string): Promise<void>;

  // -----------------------------------------------------------------------
  // App mode + config
  // -----------------------------------------------------------------------

  /** Returns "setup" on first run (no config.json found), "normal" otherwise. */
  getAppMode(): Promise<'normal' | 'setup'>;
  /** Current config paths for display in the Settings UI. */
  getConfig(): Promise<ConfigPaths>;
  /** Open a native folder or file picker dialog. */
  pickPath(args: PickPathArgs): Promise<string | null>;
  /** Write config.json to userData and restart the app. */
  saveConfigAndRestart(paths: ConfigPaths): Promise<void>;

  searchMaps(params: SearchParams): Promise<MapSummary[]>;
  getMapDetail(fileName: string): Promise<MapDetail | null>;
  getFacets(): Promise<Facets>;
  getLibraryPath(): Promise<string>;
  openInExplorer(fileName: string): Promise<void>;
  /** Update the native title bar overlay height at runtime so the OS
   *  min/max/close button strip stays matched to the React header when
   *  the user changes the UI scale in settings. */
  setTitleBarOverlayHeight(height: number): Promise<void>;
  /** Generate fresh encounter hooks for a map via the Anthropic API and
   *  append them to the dm-tool override store. Returns the FULL list of
   *  additional hooks (newest first) so the renderer can replace its
   *  local state in one shot. The API key is passed in by the renderer
   *  rather than read from disk in main — the renderer owns persistence
   *  via localStorage and we want to avoid duplicating that. */
  regenerateEncounterHooks(args: { fileName: string; apiKey: string }): Promise<string[]>;

  /** Open a URL in the user's default browser. Only accepts http/https. */
  openExternal(url: string): Promise<void>;
  /** Fetch AoN preview data for a hover card. */
  aonPreview(urlPath: string): Promise<AonPreviewData | null>;

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  /** Send a chat message and begin streaming the assistant response.
   *  Resolves when the stream completes. Text chunks arrive via
   *  onChatChunk before the promise settles. */
  chatSend(args: {
    messages: ChatMessage[];
    apiKey: string;
    model?: ChatModel;
    toolContext?: string;
    rulesMode?: boolean;
  }): Promise<void>;
  /** Extract the visible text content from an embedded tool iframe by its base URL. */
  getToolPageContent(toolUrl: string): Promise<string>;
  /** Subscribe to chat stream chunks. Returns an unsubscribe function.
   *  Same push-event pattern as onTaggerProgress. */
  onChatChunk(callback: (chunk: ChatChunk) => void): () => void;

  // -----------------------------------------------------------------------
  // Book catalog + reader
  // -----------------------------------------------------------------------

  /** Walk the configured books root and reconcile the `books` table with
   *  what's on disk. Cheap — file metadata only, no PDF parsing. Runs
   *  automatically at startup; the UI also exposes a "Rescan" button for
   *  manual refresh after the user adds/removes PDFs. */
  booksScan(): Promise<BookScanResult>;
  /** All rows in the catalog, sorted by category → subcategory → title. */
  booksList(): Promise<Book[]>;
  /** Fetch a single book by id. Returns null if the id is unknown (e.g.
   *  the renderer had a stale list and the row was removed by a rescan). */
  booksGet(id: number): Promise<Book | null>;
  /** Finalize phase-2 ingest: main writes the cover PNG to
   *  `<userData>/book-covers/<id>.png`, updates the page_count +
   *  ingested_at columns, and returns the fresh Book row. */
  booksFinalizeIngest(args: FinalizeIngestArgs): Promise<Book>;
  /** The `book-file://files/<id>` URL the renderer should hand to pdfjs.
   *  The main process resolves the id back to the absolute path at fetch
   *  time, so the renderer never sees the real filesystem path — keeps
   *  the renderer out of the file tree entirely. */
  booksGetFileUrl(id: number): Promise<string>;
  /** The `book-file://covers/<id>` URL the renderer should hand to an
   *  <img> tag. Returns the URL even if the cover doesn't exist yet — the
   *  <img> tag's onError handler will fall back to a placeholder, and
   *  once ingest completes the URL starts resolving. */
  booksGetCoverUrl(id: number): Promise<string>;

  /** Update AI metadata fields for a single book (manual reclassification). */
  booksUpdateMeta(args: {
    id: number;
    fields: { aiSystem?: string; aiCategory?: string; aiSubcategory?: string | null; aiPublisher?: string | null };
  }): Promise<Book | null>;

  /** Classify all unclassified books (or all if reclassify=true) using AI.
   *  Progress streams via onBookClassifyProgress. */
  booksClassify(args: { apiKey: string; reclassify?: boolean }): Promise<void>;
  /** Cancel an in-progress classification run. */
  booksClassifyCancel(): Promise<void>;
  /** Subscribe to classification progress events. Returns unsubscribe fn. */
  onBookClassifyProgress(callback: (p: BookClassifyProgress) => void): () => void;

  // -----------------------------------------------------------------------
  // Map tagger (ingest new maps)
  // -----------------------------------------------------------------------

  /** Whether the map-tagger binary is configured and available. If false,
   *  the Add Maps UI should be hidden — the rest of the app still works
   *  against the pre-tagged library. */
  taggerAvailable(): Promise<boolean>;
  /** Open a folder picker and return the selected path, or null if
   *  cancelled. */
  taggerPickSource(): Promise<string | null>;
  /** Spawn the tagger in --preview mode to get a cost estimate without
   *  calling the API. Progress lines stream via onTaggerProgress. */
  taggerPreview(args: TaggerRunArgs): Promise<TaggerResult>;
  /** Spawn the tagger for real ingest. Progress lines stream via
   *  onTaggerProgress. Resolves when the process exits. */
  taggerIngest(args: TaggerRunArgs): Promise<TaggerResult>;
  /** Kill a running tagger process. Returns true if one was running. */
  taggerCancel(): Promise<boolean>;
  /** Returns true if a tagger subprocess is currently running. */
  taggerIsRunning(): Promise<boolean>;
  /** Subscribe to tagger progress events (stdout/stderr lines). Returns
   *  an unsubscribe function. */
  onTaggerProgress(callback: (p: TaggerProgress) => void): () => void;

  // -----------------------------------------------------------------------
  // Pack grouping (AI-driven variant clustering)
  // -----------------------------------------------------------------------

  /** Return the cached pack mapping if it's up-to-date with the current
   *  library. Returns null when an import is needed. */
  getPackMapping(): Promise<Record<string, string> | null>;
  /** Build the prompt text the user should send to Claude to generate
   *  the pack grouping. The user copies this, pastes it into Claude,
   *  and imports the JSON response back. */
  exportPackGroupingPrompt(): Promise<string>;
  /** Open a file picker for a .json file, parse and cache the pack
   *  mapping from it. Returns the mapping, or null if the user cancelled. */
  importPackMappingFromFile(): Promise<Record<string, string> | null>;
  /** Merge multiple pack names into one and persist the change. */
  mergePacks(args: { sourcePacks: string[]; targetName: string }): Promise<Record<string, string>>;

  // -----------------------------------------------------------------------
  // Item browser
  // -----------------------------------------------------------------------

  /** Search/filter items from the PF2e database. Returns lightweight rows
   *  without descriptions. Returns [] if the PF2e DB is not configured. */
  searchItemsBrowser(params: ItemSearchParams): Promise<ItemBrowserRow[]>;
  /** Full item detail including cleaned description and parsed variants.
   *  Returns null if the item is not found or the DB is not configured. */
  getItemBrowserDetail(id: string): Promise<ItemBrowserDetail | null>;
  /** Distinct filter values (traits, sources, usage categories) for the
   *  item filter panel. Returns empty facets if the DB is not configured. */
  getItemFacets(): Promise<ItemFacets>;

  // -----------------------------------------------------------------------
  // Homebrew item creator (extends the Item Browser with create/clone)
  // -----------------------------------------------------------------------

  /** Fetch the full Foundry document for an item the user wants to use as
   *  a template for a new homebrew item. Identity fields (`_id`,
   *  `_stats`, embedded `_id`s, effect `origin`) are stripped server-side
   *  before the renderer receives the result so a re-submit produces a
   *  fresh document. Throws when foundry-mcp isn't configured. */
  getCompendiumItemTemplate(uuid: string): Promise<CompendiumItemTemplate>;
  /** Idempotently create the configured homebrew compendium pack
   *  (`world.<name>`) and return its full id. Subsequent calls reuse
   *  the existing pack. */
  ensureHomebrewItemPack(body: EnsureCompendiumPackBody): Promise<EnsureCompendiumPackResponse>;
  /** Create a single Item document inside a homebrew pack. The pack must
   *  already exist (call `ensureHomebrewItemPack` first). */
  createHomebrewItem(payload: { packId: string; item: CompendiumItemPayload }): Promise<CreateCompendiumItemResponse>;

  // -----------------------------------------------------------------------
  // Auto-Wall (wall detection for VTT import)
  // -----------------------------------------------------------------------

  /** Whether the Auto-Wall binary is configured and available. */
  autoWallAvailable(): Promise<boolean>;
  /** Launch Auto-Wall GUI with the given map image pre-loaded. */
  autoWallLaunch(fileName: string): Promise<void>;
  /** Check whether a .uvtt file exists for the given map. */
  autoWallHasUvtt(fileName: string): Promise<boolean>;
  /** Read wall segments from the .uvtt file as pixel coordinates.
   *  Returns null if no .uvtt exists. */
  autoWallGetWalls(fileName: string): Promise<{
    walls: number[][];
    width: number;
    height: number;
  } | null>;
  /** Open a file picker to import a .uvtt file for the given map. */
  autoWallImportUvtt(fileName: string): Promise<boolean>;
  /** Read the raw .uvtt sidecar JSON for a map. Returns null if no
   *  sidecar exists. The returned object can be passed directly to
   *  foundry-mcp's create_scene_from_uvtt tool. */
  getMapUvtt(fileName: string): Promise<Record<string, unknown> | null>;
  /** Push a map + its .uvtt walls to Foundry VTT via foundry-mcp.
   *  Requires foundryMcpUrl to be set in config.json. */
  pushToFoundry(fileName: string): Promise<{
    sceneId: string;
    sceneName: string;
    wallsCreated: number;
    doorsCreated: number;
  }>;

  // -----------------------------------------------------------------------
  // Monster browser
  // -----------------------------------------------------------------------

  /** Search/filter monsters from the PF2e database. */
  monstersSearch(params: MonsterSearchParams): Promise<MonsterSummary[]>;
  /** Distinct facet values for the filter panel. */
  monstersFacets(): Promise<MonsterFacets>;
  /** Full stat block for a single monster by name. */
  monstersGetDetail(name: string): Promise<MonsterDetail | null>;

  // -----------------------------------------------------------------------
  // Compendium configuration (Settings → Monsters)
  // -----------------------------------------------------------------------

  /** List every compendium pack foundry-mcp knows about. Optionally
   *  narrowed by `documentType` ('Actor' for bestiaries, 'Item' for
   *  equipment/feats/etc). Used by the Settings dialog to render a live
   *  multi-select of the packs the user actually has installed. */
  compendiumListPacks(documentType?: string): Promise<CompendiumPackSummary[]>;
  /** Currently-active monster pack list — either the user's saved
   *  override or the hardcoded defaults. */
  compendiumGetMonsterPackIds(): Promise<string[]>;
  /** Replace the monster pack list. Passing `[]` resets to defaults.
   *  Returns the post-save active list so the renderer can update state
   *  without a follow-up read. */
  compendiumSetMonsterPackIds(ids: string[]): Promise<string[]>;
  /** The hardcoded default monster pack list. Exposed so Settings can
   *  offer a "Reset to default" button that shows the default tick set
   *  without hard-coding it in the renderer. */
  compendiumGetDefaultMonsterPackIds(): Promise<string[]>;

  // -----------------------------------------------------------------------
  // Globe pins
  // -----------------------------------------------------------------------

  /** All saved globe pins. */
  globePinsList(): Promise<GlobePin[]>;
  /** Create or update a globe pin (upsert by id). */
  globePinsUpsert(pin: GlobePin): Promise<void>;
  /** Delete a globe pin by id. */
  globePinsDelete(id: string): Promise<void>;
  /** Open (or create) the Obsidian note for a globe pin. Returns false if no vault configured. */
  globePinOpenNote(pin: GlobePin): Promise<boolean>;
  /** Load the mission briefing data for a mission pin by parsing its Obsidian note frontmatter. */
  globePinGetMission(pin: GlobePin): Promise<MissionData | null>;
  /** Associate a pin with an existing Obsidian note via native file picker.
   *  Stamps the pin id into the note's frontmatter so rename-resilient
   *  lookup continues to work, then updates the pin's stored note path.
   *  Returns the updated pin, or null if the user cancelled or the chosen
   *  file is outside the vault. */
  globePinLinkNote(pin: GlobePin): Promise<GlobePin | null>;
  /** Export all pins + parsed mission data to a JSON file via save dialog.
   *  The output file is designed for the player-map static site. */
  globeExportPlayerData(): Promise<boolean>;

  // -----------------------------------------------------------------------
  // Party inventory (DM-local storage for party loot via LootPanel)
  // -----------------------------------------------------------------------

  inventoryList(): Promise<PartyInventoryItem[]>;
  inventoryUpsert(item: PartyInventoryItem): Promise<void>;
  inventoryDelete(id: string): Promise<void>;

  // -----------------------------------------------------------------------
  // Aurus leaderboard (live-synced via foundry-mcp)
  // -----------------------------------------------------------------------

  aurusList(): Promise<AurusTeam[]>;
  aurusUpsert(team: AurusTeam): Promise<void>;
  aurusDelete(id: string): Promise<void>;

  // -----------------------------------------------------------------------
  // Combat tracker (encounters + initiative)
  // -----------------------------------------------------------------------

  encountersList(): Promise<Encounter[]>;
  encountersUpsert(encounter: Encounter): Promise<void>;
  encountersDelete(id: string): Promise<void>;
  /** Subscribe to live initiative updates pushed from Foundry via the
   *  combat SSE channel. Fires when a combatant's initiative changes in
   *  Foundry (e.g. a player rolls initiative). Returns an unsubscribe fn. */
  onCombatantInitiativeUpdate(callback: (event: CombatantInitiativeEvent) => void): () => void;
  /** Generate loot for an encounter via Anthropic. Returns the new loot
   *  list; the renderer is responsible for persisting it onto the
   *  encounter via encountersUpsert. */
  generateEncounterLoot(args: { encounter: Encounter; partyLevel: number; apiKey: string }): Promise<LootItem[]>;
  /** Push an encounter's monster combatants to Foundry VTT as actors,
   *  organized in a folder named after the encounter. Requires
   *  foundryMcpUrl to be set in config.json and a live Foundry session
   *  with the API Bridge module connected. Returns a summary of what
   *  was created + skipped so the UI can surface ambiguities. */
  pushEncounterToFoundry(encounterId: string): Promise<PushEncounterResult>;
  /** Fetch player characters from the GM's party folder in Foundry.
   *  Returns an empty array when foundryMcpUrl is not configured, the
   *  bridge is not connected, or the folder contains no characters.
   *  The folder name defaults to "The Party" and can be overridden by
   *  passing `?folder=` on the HTTP side. */
  listPartyMembers(): Promise<PartyMember[]>;
  /** Fetch spellcasting entries + slot state for a Foundry actor by id.
   *  Returns null when foundryMcpUrl is not configured or the bridge is
   *  disconnected. */
  getActorSpellcasting(actorId: string): Promise<ActorSpellcasting | null>;
  /** Subscribe to live actor state changes from Foundry via the `actors`
   *  SSE channel. Fires on any `updateActor` hook; `changedPaths` lets
   *  handlers filter to the fields they care about. Returns an unsubscribe
   *  function. */
  onActorUpdated(callback: (update: ActorUpdate) => void): () => void;
  /** Push a manual HP change from dm-tool back to Foundry. PATCHes
   *  `system.attributes.hp.value` (and `.max` if provided) on the actor
   *  via foundry-mcp. No-op when foundryMcpUrl is not configured. */
  pushActorHp(actorId: string, hp: number, maxHp?: number): Promise<void>;
}
