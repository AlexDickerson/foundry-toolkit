// Public entry point for the foundry-mcp RPC schemas subpath.
//
// Re-exports the Zod schemas and derives request-body types via
// `z.infer<>` so clients (character-creator, future consumers) can
// import a typed body shape without redeclaring it.

import type { z } from 'zod/v4';

import type {
  addItemFromCompendiumBody,
  adjustActorConditionBody,
  adjustActorResourceBody,
  createActorBody,
  resolvePromptBody,
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
export type AdjustActorResourceBody = z.infer<typeof adjustActorResourceBody>;
export type ActorResourceKey = AdjustActorResourceBody['resource'];

export interface AdjustActorResourceResponse {
  actorId: string;
  resource: ActorResourceKey;
  before: number;
  after: number;
  /** null when the resource has no natural cap (currently only 'hp-temp'). */
  max: number | null;
}

export type AdjustActorConditionBody = z.infer<typeof adjustActorConditionBody>;
export type ActorConditionKey = AdjustActorConditionBody['condition'];

export interface AdjustActorConditionResponse {
  actorId: string;
  condition: ActorConditionKey;
  before: number;
  after: number;
  /** Re-read after the writes — dying's cap shifts with doomed. */
  max: number;
}

// Error response shape for `/api/*` — mirrored in `foundry-api.ts` as
// `ApiError` (same shape). Re-exported here for callers that want to
// type both the request and the error body from one subpath.
export interface ErrorResponse {
  error: string;
  suggestion?: string;
}
