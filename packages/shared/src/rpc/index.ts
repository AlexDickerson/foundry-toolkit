// Public entry point for the foundry-mcp RPC schemas subpath.
//
// Re-exports the Zod schemas and derives request-body types via
// `z.infer<>` so clients (character-creator, future consumers) can
// import a typed body shape without redeclaring it.

export * from './dialog.js';
export * from './dispatch.js';

import type { z } from 'zod/v4';

import type {
  addItemFromCompendiumBody,
  adjustActorConditionBody,
  adjustActorResourceBody,
  createActorBody,
  invokeActorActionBody,
  resolvePromptBody,
  rollActorStatisticBody,
  updateActorBody,
  updateActorItemBody,
  uploadAssetBody,
} from './schemas.js';

export * from './schemas.js';

export type CreateActorBody = z.infer<typeof createActorBody>;
export type UpdateActorBody = z.infer<typeof updateActorBody>;
export type AddItemFromCompendiumBody = z.infer<typeof addItemFromCompendiumBody>;
export type UpdateActorItemBody = z.infer<typeof updateActorItemBody>;
export type ResolvePromptBody = z.infer<typeof resolvePromptBody>;
export type UploadAssetBody = z.infer<typeof uploadAssetBody>;
export type InvokeActorActionBody = z.infer<typeof invokeActorActionBody>;

// Action-specific param/response shapes. Each action routes through
// `POST /api/actors/:id/actions/:action` with `params` shaped like the
// `*Params` type below; the bridge handler parses the matching shared
// schema (e.g. `adjustActorResourceBody`) and returns the matching
// response. Kept here (not per-component) so server + SPA can't drift
// silently when a new key or response field gets added.
export type AdjustActorResourceParams = z.infer<typeof adjustActorResourceBody>;
export type ActorResourceKey = AdjustActorResourceParams['resource'];

export interface AdjustActorResourceResponse {
  actorId: string;
  resource: ActorResourceKey;
  before: number;
  after: number;
  /** null when the resource has no natural cap (currently only 'hp-temp'). */
  max: number | null;
}

export type AdjustActorConditionParams = z.infer<typeof adjustActorConditionBody>;
export type ActorConditionKey = AdjustActorConditionParams['condition'];

export interface AdjustActorConditionResponse {
  actorId: string;
  condition: ActorConditionKey;
  before: number;
  after: number;
  /** Re-read after the writes — dying's cap shifts with doomed. */
  max: number;
}

export type RollActorStatisticParams = z.infer<typeof rollActorStatisticBody>;
export type Pf2eStatisticSlug = RollActorStatisticParams['statistic'];
export type Pf2eRollMode = NonNullable<RollActorStatisticParams['rollMode']>;

export interface RollActorStatisticResponse {
  statistic: Pf2eStatisticSlug;
  total: number;
  formula: string;
  dice: Array<{ type: string; count: number; results: number[] }>;
  isCritical?: boolean;
  isFumble?: boolean;
  chatMessageId?: string;
}

// Error response shape for `/api/*` — mirrored in `foundry-api.ts` as
// `ApiError` (same shape). Re-exported here for callers that want to
// type both the request and the error body from one subpath.
export interface ErrorResponse {
  error: string;
  suggestion?: string;
}
