// Wire types for the generic Foundry dispatcher (Layer 0).
//
// The dispatcher accepts { class, id, method, args } and routes to
// game[collection].get(id)[method](...args) inside the Foundry module.
// Two marshaling concerns are handled transparently:
//   Inbound : DocRef args resolved to live documents before the method call.
//   Outbound: Document results serialized via .toObject(); others pass through.
//
// Consumed by:
//   - apps/foundry-api-bridge  — DispatchHandler registers the command
//   - packages/pf2e-rules      — createPf2eClient builds typed DispatchRequests
//   - apps/player-portal       — api.dispatch sends POST /api/dispatch

import { z } from 'zod/v4';

// ─── DocRef ─────────────────────────────────────────────────────────────────

/**
 * A DocRef arg tells the dispatcher to resolve `game[collection].get(id)`
 * before passing the value to the target method.  Use when the Foundry API
 * expects a live Document object rather than a plain id string.
 */
export const docRefSchema = z.object({
  __doc: z.string().min(1),
  id: z.string().min(1),
});

export type DocRef = z.infer<typeof docRefSchema>;

// ─── Request ─────────────────────────────────────────────────────────────────

/**
 * Full request shape sent to `POST /api/dispatch`.
 *
 * `method` supports:
 *   - Simple names:   'applyDamage'
 *   - Dot-paths:      'saves.fortitude.roll'
 *   - Array lookup:   'system.actions[@slug:longsword].rollDamage'
 *     → finds the first element in actor.system.actions where
 *       item.slug === 'longsword' (also checks .slug / .item.name).
 */
export const dispatchRequestSchema = z.object({
  /** Foundry / PF2e class name used to resolve the world collection.
   *  Supported: 'Actor', 'CharacterPF2e', 'NPCPF2e', 'VehiclePF2e',
   *  'HazardPF2e', 'FamiliarPF2e', 'Item', 'JournalEntry'.  */
  class: z.string().min(1),
  /** Foundry document id. */
  id: z.string().min(1),
  /** Dot-path to the method to call on the resolved document. */
  method: z.string().min(1),
  /** Positional arguments.  DocRef objects are resolved to live documents
   *  before dispatch; all other values are passed through as-is. */
  args: z.array(z.unknown()).default([]),
});

export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;

// ─── Response ────────────────────────────────────────────────────────────────

/**
 * Response envelope from `POST /api/dispatch` on success (HTTP 2xx).
 * On error the HTTP status is 4xx/5xx and the body is `{ error: string }`.
 *
 * Document return values are serialized via `.toObject()`.
 * void / undefined returns become `null`.
 */
export const dispatchResponseSchema = z.object({
  /** JSON-serializable return value from the Foundry method call. */
  result: z.unknown(),
});

export type DispatchResponse = z.infer<typeof dispatchResponseSchema>;
