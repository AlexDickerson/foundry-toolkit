import type { InvokeActorActionParams, InvokeActorActionResult } from '@/commands/types';

// Minimal Foundry type snippets. Kept local to the handler because
// the pf2e action surface is runtime-only; the bundled type shapes
// don't cover it and we'd rather narrow defensively here than import
// broken types.

interface FoundryActor {
  id: string;
  uuid: string;
  type: string;
}

interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

type PF2eActionFn = (options: Record<string, unknown>) => Promise<unknown> | unknown;

interface FoundryGame {
  actors: ActorsCollection;
  pf2e?: {
    actions?: Record<string, PF2eActionFn | undefined>;
  };
}

interface FoundryGlobals {
  game: FoundryGame;
}

function getFoundry(): FoundryGlobals {
  return globalThis as unknown as FoundryGlobals;
}

// Per-action handler signature. Receives the resolved actor + the
// untyped params bag from the request; returns whatever structured
// result makes sense for the action (opaque to the router).
type ActionHandler = (actor: FoundryActor, params: Record<string, unknown>) => Promise<InvokeActorActionResult>;

// ─── Action registry ───────────────────────────────────────────────────

// Dispatch table. Adding a new outbound action is a single entry —
// no new command type, no new HTTP route, no SPA api method.
const ACTION_HANDLERS: Record<string, ActionHandler> = {
  craft: craftAction,
};

// ─── craft ─────────────────────────────────────────────────────────────

// pf2e's `game.pf2e.actions.craft` accepts `uuid` directly and
// resolves it internally — we don't need to `fromUuid` ourselves.
// The action fires a Crafting skill check chat card; SPA state
// refreshes via the `actors` event channel if the roll mutates the
// actor (on success it creates an item in inventory).
async function craftAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const itemUuid = typeof params['itemUuid'] === 'string' ? params['itemUuid'] : null;
  if (itemUuid === null || itemUuid.length === 0) {
    throw new Error('craft: params.itemUuid is required');
  }
  const quantityRaw = params['quantity'];
  const quantity = typeof quantityRaw === 'number' && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;

  const { pf2e } = getFoundry().game;
  const craftFn = pf2e?.actions?.['craft'];
  if (typeof craftFn !== 'function') {
    throw new Error('craft: game.pf2e.actions.craft is unavailable (pf2e system not installed?)');
  }

  await craftFn({
    uuid: itemUuid,
    actors: [actor],
    quantity,
  });

  return { ok: true };
}

// ─── Router ────────────────────────────────────────────────────────────

export async function invokeActorActionHandler(
  params: InvokeActorActionParams,
): Promise<InvokeActorActionResult> {
  const { actorId, action } = params;
  const actor = getFoundry().game.actors.get(actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${actorId}`);
  }

  const handler = ACTION_HANDLERS[action];
  if (!handler) {
    const known = Object.keys(ACTION_HANDLERS).join(', ');
    throw new Error(`Unknown action: ${action} (known: ${known})`);
  }

  return handler(actor, params.params ?? {});
}

// Exported for tests; the registry is otherwise an implementation
// detail of the dispatch.
export const KNOWN_ACTIONS = Object.freeze(Object.keys(ACTION_HANDLERS));
