/** Combat and combatant command params and results. */

import type { TokenHpData } from './shared';

export interface CreateCombatParams {
  sceneId?: string;
  activate?: boolean;
}

export interface AddCombatantParams {
  combatId?: string;
  actorId: string;
  tokenId?: string;
  initiative?: number;
  hidden?: boolean;
}

export interface RemoveCombatantParams {
  combatId?: string;
  combatantId: string;
}

export interface CombatIdParams {
  combatId?: string;
}

export interface SetTurnParams {
  combatantId: string;
  combatId?: string;
}

export interface RollInitiativeParams {
  combatId?: string;
  combatantIds: string[];
  formula?: string;
}

export interface SetInitiativeParams {
  combatId?: string;
  combatantId: string;
  initiative: number;
}

export interface RollAllInitiativeParams {
  combatId?: string;
  formula?: string;
  npcsOnly?: boolean;
}

export interface UpdateCombatantParams {
  combatId?: string;
  combatantId: string;
  initiative?: number;
  defeated?: boolean;
  hidden?: boolean;
}

export interface SetCombatantDefeatedParams {
  combatId?: string;
  combatantId: string;
  defeated: boolean;
}

export interface ToggleCombatantVisibilityParams {
  combatId?: string;
  combatantId: string;
}

export interface GetCombatTurnContextParams {
  combatId?: string;
}

// Combat Results
export interface CombatantResult {
  id: string;
  actorId: string;
  tokenId: string | null;
  name: string;
  img: string;
  initiative: number | null;
  defeated: boolean;
  hidden: boolean;
}

export interface CombatResult {
  id: string;
  round: number;
  turn: number;
  started: boolean;
  combatants: CombatantResult[];
  current: CombatantResult | null;
}

export interface InitiativeResult {
  combatantId: string;
  name: string;
  initiative: number;
}

export interface InitiativeRollResult {
  results: InitiativeResult[];
}

// Combat Turn Context types
export interface TurnCombatantInfo {
  id: string;
  actorId: string;
  tokenId: string;
  name: string;
  gridX: number;
  gridY: number;
  hp?: TokenHpData;
  ac?: number;
  conditions: string[];
}

export interface NearbyTokenInfo {
  tokenId: string;
  actorId: string | null;
  name: string;
  gridX: number;
  gridY: number;
  distanceFt: number;
  disposition: string;
  hp?: TokenHpData;
  ac?: number;
  conditions: string[];
  lineOfSight: boolean;
}

export interface CombatTurnContext {
  round: number;
  turn: number;
  currentCombatant: TurnCombatantInfo;
  nearbyTokens: NearbyTokenInfo[];
  asciiMap: string;
}
