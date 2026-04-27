import type { InvokeActorActionResult } from '@/commands/types';
import { getFoundry } from './types';
import type { FoundryActor } from './types';

// pf2e's `game.pf2e.actions.craft` accepts `uuid` directly and
// resolves it internally — we don't need to `fromUuid` ourselves.
// The action fires a Crafting skill check chat card; SPA state
// refreshes via the `actors` event channel if the roll mutates the
// actor (on success it creates an item in inventory).

export async function craftAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const itemUuid = params['itemUuid'];
  if (typeof itemUuid !== 'string' || itemUuid.length === 0) {
    throw new Error('craft: params.itemUuid is required');
  }
  const quantityRaw = params['quantity'];
  const quantity = typeof quantityRaw === 'number' && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;

  const craftFn = getFoundry().game.pf2e?.actions?.['craft'];
  if (typeof craftFn !== 'function') {
    throw new Error('craft: game.pf2e.actions.craft is unavailable (pf2e system not installed?)');
  }

  await craftFn({ uuid: itemUuid, actors: [actor], quantity });

  return { ok: true };
}
