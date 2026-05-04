import type { TokenResult } from '@/commands/types';
import type { FoundryToken as SharedFoundryToken } from '../../../types/foundry-event-shapes.js';

export interface TokenUpdateData {
  x?: number;
  y?: number;
  elevation?: number;
  rotation?: number;
  hidden?: boolean;
  scale?: number;
  name?: string;
  displayName?: number;
  disposition?: number;
  lockRotation?: boolean;
}

// Strict token shape for CRUD operations. Extends the shared superset and
// narrows the fields that token handlers require to be non-optional.
export interface FoundryToken extends SharedFoundryToken {
  name: string;
  elevation: number;
  rotation: number;
  hidden: boolean;
  texture: { src: string };
  disposition: number;
  actor: {
    id: string;
    system?: {
      attributes?: {
        hp?: { value: number; max: number };
        ac?: { value: number };
      };
    };
    statuses?: Set<string>;
  } | null;
  update(data: TokenUpdateData, options?: TokenUpdateOptions): Promise<FoundryToken>;
  delete(): Promise<FoundryToken>;
}

export interface TokenUpdateOptions {
  animate?: boolean;
}

interface FoundryTokensCollection {
  get(id: string): FoundryToken | undefined;
  contents: FoundryToken[];
}

export interface TokenCreateData {
  actorId: string;
  x: number;
  y: number;
  hidden?: boolean;
  elevation?: number;
  rotation?: number;
  scale?: number;
}

interface FoundryScene {
  id: string;
  name: string;
  tokens: FoundryTokensCollection;
  createEmbeddedDocuments(type: 'Token', data: TokenCreateData[]): Promise<FoundryToken[]>;
  deleteEmbeddedDocuments(type: 'Token', ids: string[]): Promise<unknown[]>;
}

interface FoundryScenesCollection {
  get(id: string): FoundryScene | undefined;
  active: FoundryScene | null;
}

export interface FoundryGame {
  scenes: FoundryScenesCollection;
}

export function mapTokenToResult(token: FoundryToken): TokenResult {
  const result: TokenResult = {
    id: token.id,
    name: token.name,
    actorId: token.actor?.id ?? null,
    x: token.x,
    y: token.y,
    elevation: token.elevation,
    rotation: token.rotation,
    hidden: token.hidden,
    disposition: token.disposition,
    conditions: token.actor?.statuses ? [...token.actor.statuses] : [],
  };

  const hp = token.actor?.system?.attributes?.hp;
  if (hp) {
    result.hp = { value: hp.value, max: hp.max };
  }

  const ac = token.actor?.system?.attributes?.ac;
  if (ac) {
    result.ac = ac.value;
  }

  return result;
}

export function getActiveScene(game: FoundryGame, sceneId?: string): FoundryScene {
  if (sceneId) {
    const scene = game.scenes.get(sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    return scene;
  }

  const activeScene = game.scenes.active;
  if (!activeScene) {
    throw new Error('No active scene');
  }
  return activeScene;
}

export function getToken(scene: FoundryScene, tokenId: string): FoundryToken {
  const token = scene.tokens.get(tokenId);
  if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
  }
  return token;
}
