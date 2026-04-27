/** Scene CRUD, walls, tokens-in-scene, capture, and analysis command params and results. */

import type { TokenHpData } from './shared';

// Scene Commands
export interface GetSceneParams {
  sceneId?: string;
  includeScreenshot?: boolean;
  include?: string[];
  center?: { x: number; y: number };
  radius?: number;
}

export type GetScenesListParams = Record<string, never>;

export interface CreateSceneParams {
  name: string;
  img?: string;
  width?: number;
  height?: number;
  gridSize?: number;
  gridUnits?: string;
  gridDistance?: number;
  folder?: string;
}

export interface WallDefinition {
  c: [number, number, number, number];
  move?: number; // 0=none, 1=normal (default 1)
  sense?: number; // 0=none, 1=normal (default 1)
  door?: number; // 0=none, 1=door, 2=secret (default 0)
}

export interface CreateWallsParams {
  sceneId?: string;
  walls: WallDefinition[];
}

export interface CreateWallsResult {
  created: number;
  wallIds: string[];
}

export interface UvttResolution {
  pixels_per_grid: number;
  map_size: { x: number; y: number };
  map_origin?: { x: number; y: number };
}

export interface UvttPortal {
  position: { x: number; y: number };
  bounds: Array<{ x: number; y: number }>;
  rotation?: number;
  closed?: boolean;
  freestanding?: boolean;
}

export interface UvttData {
  resolution: UvttResolution;
  line_of_sight: Array<Array<{ x: number; y: number }>>;
  portals?: UvttPortal[];
}

export interface CreateSceneFromUvttParams {
  name: string;
  img?: string;
  uvtt: UvttData;
  gridDistance?: number;
  gridUnits?: string;
  activate?: boolean;
}

export interface CreateSceneFromUvttResult {
  id: string;
  name: string;
  img: string;
  width: number;
  height: number;
  active: boolean;
  wallsCreated: number;
  doorsCreated: number;
  gridSize: number;
  gridCols: number;
  gridRows: number;
}

export interface DeleteWallParams {
  sceneId?: string;
  wallId: string;
}

export interface NormalizeSceneParams {
  sceneId?: string;
}

export interface NormalizeSceneResult {
  id: string;
  name: string;
  before: { width: number; height: number; padding: number };
  after: { width: number; height: number; padding: number };
  gridSize: number;
  gridCols: number;
  gridRows: number;
}

export interface AnalyzeSceneParams {
  sceneId?: string;
}

export interface AnalyzeSceneResult {
  id: string;
  name: string;
  gridSize: number;
  cols: number;
  rows: number;
  /** One character per cell, row-major. '#'=wall, '·'=floor, '~'=outside, ' '=empty */
  grid: string;
  legend: string;
}

export interface ActivateSceneParams {
  sceneId: string;
}

// Capture Scene types
export type CaptureSceneParams = Record<string, never>;

export interface CaptureSceneResult {
  sceneId: string;
  sceneName: string;
  image: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface UpdateSceneParams {
  sceneId?: string;
  background?: string;
  name?: string;
  darkness?: number;
  gridSize?: number;
  gridUnits?: string;
  gridDistance?: number;
}

export interface UpdateSceneResult {
  id: string;
}

export interface GetSceneBackgroundParams {
  sceneId?: string;
  maxDimension?: number;
}

export interface GetSceneBackgroundResult {
  sceneId: string;
  sceneName: string;
  image: string;
  mimeType: string;
  width: number;
  height: number;
}

// Scene Results
export interface SceneGridResult {
  size: number;
  type: number;
  units: string;
  distance: number;
}

export interface SceneNoteResult {
  x: number;
  y: number;
  text: string;
  label: string;
  entryId: string | null;
}

export interface SceneWallResult {
  c: number[];
  move: number;
  sense: number;
  door: number;
}

export interface SceneLightResult {
  x: number;
  y: number;
  bright: number;
  dim: number;
  color: string | null;
  angle: number;
  walls: boolean;
  hidden: boolean;
}

export interface SceneTileResult {
  x: number;
  y: number;
  width: number;
  height: number;
  img: string;
  hidden: boolean;
  elevation: number;
  rotation: number;
}

export interface SceneDrawingResult {
  x: number;
  y: number;
  shape: { type: string; width: number; height: number; points: number[] };
  text: string;
  hidden: boolean;
  fillColor: string | null;
  strokeColor: string | null;
}

export interface SceneRegionResult {
  id: string;
  name: string;
  color: string | null;
  shapes: { type: string }[];
}

export interface SceneTokenSummary {
  id: string;
  name: string;
  actorId: string | null;
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  elevation: number;
  hidden: boolean;
  disposition: number;
  hp?: TokenHpData;
  ac?: number;
  conditions: string[];
}

export interface SceneScreenshot {
  image: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface SceneDetailResult {
  id: string;
  name: string;
  active: boolean;
  img: string;
  width: number;
  height: number;
  grid: SceneGridResult;
  darkness: number;
  notes: SceneNoteResult[];
  walls: SceneWallResult[];
  lights: SceneLightResult[];
  tiles: SceneTileResult[];
  drawings: SceneDrawingResult[];
  regions: SceneRegionResult[];
  tokens: SceneTokenSummary[];
  asciiMap: string;
  screenshot?: SceneScreenshot;
}

export interface SceneSummaryResult {
  id: string;
  name: string;
  active: boolean;
  img: string;
}

export interface SceneListResult {
  scenes: SceneSummaryResult[];
}

export interface CreateSceneResult {
  id: string;
  name: string;
  img: string;
  width: number;
  height: number;
  active: boolean;
}

export interface ActivateSceneResult {
  id: string;
  name: string;
  active: boolean;
}
