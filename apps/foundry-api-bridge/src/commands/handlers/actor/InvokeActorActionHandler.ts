import type { InvokeActorActionParams, InvokeActorActionResult } from '@/commands/types';
import { getFoundry } from './actions/types';
import { ACTION_HANDLERS } from './actions';

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
