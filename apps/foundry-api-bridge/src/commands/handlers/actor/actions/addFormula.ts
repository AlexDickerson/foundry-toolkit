import type { InvokeActorActionResult } from '@/commands/types';
import { readFormulas } from './_shared';
import type { FoundryActor } from './types';

// Appends a compendium UUID to `system.crafting.formulas`. Dedupes so
// clicking Add twice on the same item is a no-op, not a duplicate. The
// pf2e sheet's `+ Add Formula` button does the same thing. Returns the
// post-update formula count so the SPA can echo "N formulas known"
// without a full refetch.

export async function addFormulaAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const uuid = params['uuid'];
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new Error('add-formula: params.uuid is required');
  }

  const formulas = readFormulas(actor);
  const alreadyKnown = formulas.some((f) => f.uuid === uuid);
  if (alreadyKnown) {
    return { ok: true, added: false, uuid, formulaCount: formulas.length };
  }
  const next = [...formulas, { uuid }];
  await actor.update({ 'system.crafting.formulas': next });
  return { ok: true, added: true, uuid, formulaCount: next.length };
}
