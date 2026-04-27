/** Token placement, movement, patrol command params and results. */

import type { TokenHpData } from './shared';

// Token Commands
export interface CreateTokenParams {
  sceneId?: string;
  actorId: string;
  x: number;
  y: number;
  hidden?: boolean;
  elevation?: number;
  rotation?: number;
  scale?: number;
}

export interface DeleteTokenParams {
  sceneId?: string;
  tokenId: string;
}

export interface MoveTokenParams {
  sceneId?: string;
  tokenId: string;
  x: number;
  y: number;
  elevation?: number;
  rotation?: number;
  animate?: boolean;
}

export interface UpdateTokenParams {
  sceneId?: string;
  tokenId: string;
  hidden?: boolean;
  elevation?: number;
  rotation?: number;
  scale?: number;
  name?: string;
  displayName?: number;
  disposition?: number;
  lockRotation?: boolean;
}

export interface GetSceneTokensParams {
  sceneId?: string;
}

// Shared waypoint for paths and patrols
export interface TokenWaypoint {
  x: number;
  y: number;
}

export interface MoveTokenPathParams {
  sceneId?: string;
  tokenId: string;
  waypoints: TokenWaypoint[];
  coordType?: 'pixel' | 'grid';
  delayMs?: number;
  animate?: boolean;
}

export interface MoveTokenPathResult {
  id: string;
  steps: number;
}

export interface SetPatrolParams {
  sceneId?: string;
  tokenId: string;
  waypoints: TokenWaypoint[];
  coordType?: 'pixel' | 'grid';
  delayMs?: number;
  intervalMs?: number;
  loop?: boolean;
  animate?: boolean;
}

export interface SetPatrolResult {
  patrolId: string;
  tokenId: string;
  waypoints: number;
}

export interface StopPatrolParams {
  tokenId: string;
}

export interface StopPatrolResult {
  stopped: boolean;
}

export interface GetPatrolsParams {
  sceneId?: string;
}

export interface PatrolInfo {
  patrolId: string;
  tokenId: string;
  tokenName: string;
  waypoints: TokenWaypoint[];
  currentStep: number;
  loop: boolean;
  delayMs: number;
  intervalMs: number;
}

export interface GetPatrolsResult {
  patrols: PatrolInfo[];
}

// Token Results
export interface TokenResult {
  id: string;
  name: string;
  actorId: string | null;
  x: number;
  y: number;
  elevation: number;
  rotation: number;
  hidden: boolean;
  disposition: number;
  hp?: TokenHpData;
  ac?: number;
  conditions: string[];
}

export interface SceneTokensResult {
  sceneId: string;
  sceneName: string;
  tokens: TokenResult[];
}
