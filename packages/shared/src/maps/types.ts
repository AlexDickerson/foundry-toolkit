/** Controlled vocabulary — kept loose on the TS side since the DB is the
 *  source of truth and we don't want to break the app if the Python side
 *  adds a new value. */
export type InteriorExterior = 'interior' | 'exterior' | 'mixed' | 'unknown';
export type TimeOfDay = 'day' | 'dusk' | 'night' | 'dawn' | 'unknown';
export type GridVisible = 'gridded' | 'gridless' | 'unknown';

/** A lightweight row used by the browser grid. This is what `searchMaps`
 *  returns — enough to render a thumbnail, title, and a few chips without
 *  the full sidecar payload. */
export interface MapSummary {
  fileName: string;
  title: string;
  description: string;
  interiorExterior: InteriorExterior | null;
  timeOfDay: TimeOfDay | null;
  gridVisible: GridVisible | null;
  gridCells: string | null;
  approxPartyScale: string | null;
}

/** The full sidecar contents for a single map, used by the detail pane. */
export interface MapDetail extends MapSummary {
  fileHashSha256: string;
  phash: string;
  widthPx: number;
  heightPx: number;
  biomes: string[];
  locationTypes: string[];
  mood: string[];
  features: string[];
  encounterHooks: string[];
  /** Additional encounter hooks generated client-side via the Anthropic
   *  API and persisted to a dm-tool-owned override file (see
   *  electron/hooks-store.ts). The DB is read-only, so these can't live
   *  in the sidecar JSON. Newest first — UI prepends to this list when
   *  the user clicks the refresh button. */
  additionalEncounterHooks: string[];
  taggedAt: string; // ISO 8601
  model: string;
}

export interface SearchParams {
  keywords?: string;
  biomes?: string[];
  locationTypes?: string[];
  mood?: string[];
  features?: string[];
  interiorExterior?: InteriorExterior;
  timeOfDay?: TimeOfDay;
  gridVisible?: GridVisible;
  limit?: number;
}

/** Distinct tag values returned by `listFacets` so the filter panel can
 *  show checkboxes without hardcoding the enum lists. */
export interface Facets {
  biomes: string[];
  locationTypes: string[];
  moods: string[];
  features: string[];
}

// ---------------------------------------------------------------------------
// Map tagger (ingest new maps)
// ---------------------------------------------------------------------------

export interface TaggerRunArgs {
  sourcePath: string;
  apiKey: string;
  limit: number;
  concurrency?: number;
}

export interface TaggerProgress {
  type: 'stdout' | 'stderr';
  line: string;
}

export interface TaggerResult {
  exitCode: number | null;
  signal: string | null;
}

// ---------------------------------------------------------------------------
// Mission briefing data (parsed from Obsidian frontmatter)
// ---------------------------------------------------------------------------

export type MissionThreatLevel = 'Trivial' | 'Low' | 'Moderate' | 'Severe' | 'Extreme';
export type MissionStatus = 'Available' | 'Assigned' | 'Active' | 'Completed' | 'Failed';

export interface MissionObjective {
  id: string;
  text: string;
  /** Primary objectives are mandatory; secondary are optional.
   *  Frontmatter accepts either `primary: true` or `required: true`. */
  isPrimary: boolean;
  completed: boolean;
}

export interface MissionThreat {
  id: string;
  name: string;
  /** Numeric level, or a string like "—" when not applicable (e.g. for
   *  environmental hazards). Stored verbatim — the UI just displays it. */
  level: number | string;
  type?: string;
}

export interface MissionReward {
  gold?: number;
  xp?: number;
  items?: string[];
}

export interface MissionData {
  name: string;
  threatLevel: MissionThreatLevel;
  status: MissionStatus;
  recommendedLevel: string;
  estimatedSessions: string;
  location: string;
  questGiver: { name: string; title: string };
  briefing: string[];
  objectives: MissionObjective[];
  threats: MissionThreat[];
  rewards: MissionReward;
  dmNotes: string;
  datePosted: string;
  sourceBook?: string;
  /** Organizational branch issuing the posting (e.g. a faction arm). */
  arm?: string;
  /** Free-form description of the party/parties handling the mission. */
  assignedTo?: string;
  /** The target/prize of the mission — typically a named artifact. May
   *  contain Obsidian-style `[[wikilinks]]`. */
  artifact?: string;
}

// ---------------------------------------------------------------------------
// Globe pins
// ---------------------------------------------------------------------------

export type GlobePinKind = 'note' | 'mission';

export interface GlobePin {
  id: string;
  lng: number;
  lat: number;
  label: string;
  /** game-icons.net icon name (e.g. "crossed-swords"). Empty string = default dot. */
  icon: string;
  /** CSS hex fill color for the pin's circle (e.g. "#e03c31"). Empty/absent = default golden. */
  iconColor?: string;
  /** Zoom level at which the pin was placed. Icons shrink when zoomed out past this. */
  zoom: number;
  /** Relative path to the Obsidian note within the vault (e.g. "Golarion/My Pin a1b2c3d4.md"). Empty = no note yet. */
  note: string;
  /** Pin kind: generic note (opens Obsidian on dbl-click) or mission (opens in-universe briefing). */
  kind: GlobePinKind;
  /** Pre-parsed mission data, present only on mission pins in the exported
   *  data.json consumed by the player-map. DB-stored pins never carry
   *  this — missions are re-parsed on demand on the DM side. */
  mission?: MissionData;
}

/** Shape of the data.json file the DM tool writes out and the player-map
 *  consumes as its static data source. */
export interface ExportData {
  exportedAt: string;
  pins: GlobePin[];
}
