import type { InvokeActorActionResult } from '@/commands/types';
import { readFormulas } from './_shared';
import type { FoundryActor } from './types';

// Removes a formula by its compendium UUID. No-op when the formula
// isn't known — lets the SPA fire-and-forget without a pre-check.

export async function removeFormulaAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const uuid = params['uuid'];
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new Error('remove-formula: params.uuid is required');
  }

  const formulas = readFormulas(actor);
  const next = formulas.filter((f) => f.uuid !== uuid);
  if (next.length === formulas.length) {
    return { ok: true, removed: false, uuid, formulaCount: formulas.length };
  }
  await actor.update({ 'system.crafting.formulas': next });
  return { ok: true, removed: true, uuid, formulaCount: next.length };
}
