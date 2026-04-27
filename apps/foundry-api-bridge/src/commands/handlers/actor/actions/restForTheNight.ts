import type { InvokeActorActionResult } from '@/commands/types';
import { getFoundry } from './types';
import type { FoundryActor } from './types';

// pf2e's Rest for the Night — daily preparations, HP/heal, spell
// slot reset, resource refresh. `skipDialog` suppresses the native
// confirmation popup so the SPA can drive it silently. Returns the
// chat message count so the SPA can echo "N recovery results" if it
// wants to, matching the prior eval-based shape.

export async function restForTheNightAction(
  actor: FoundryActor,
  _params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  if (actor.type !== 'character') {
    throw new Error(`rest-for-the-night: actor ${actor.id} is a ${actor.type}, not a character`);
  }
  const restFn = getFoundry().game.pf2e?.actions?.['restForTheNight'];
  if (typeof restFn !== 'function') {
    throw new Error(
      'rest-for-the-night: game.pf2e.actions.restForTheNight is unavailable (pf2e system not installed?)',
    );
  }

  const result = (await restFn({ actors: [actor], skipDialog: true }));
  const messageCount = Array.isArray(result) ? result.length : 0;

  return { ok: true, messageCount };
}
