import type { InvokeActorActionResult } from '@/commands/types';
import { resolveStrike } from './_shared';
import type { FoundryActor } from './types';

// Rolls a single MAP variant of a PF2e strike. `variantIndex` 0/1/2
// maps to first attack / second (−5 MAP) / third (−10 MAP). The
// PF2e `StrikeData` lives at `actor.system.actions[i]` and each
// variant exposes its own `roll()` that bakes in the MAP penalty.

export async function rollStrikeAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  if (actor.type !== 'character') {
    throw new Error(`roll-strike: actor ${actor.id} is a ${actor.type}, not a character`);
  }
  const strikeSlug = params['strikeSlug'];
  if (typeof strikeSlug !== 'string' || strikeSlug.length === 0) {
    throw new Error('roll-strike: params.strikeSlug is required');
  }
  const variantIndex = params['variantIndex'];
  if (typeof variantIndex !== 'number' || !Number.isInteger(variantIndex) || variantIndex < 0) {
    throw new Error('roll-strike: params.variantIndex must be a non-negative integer');
  }

  const strike = resolveStrike(actor, strikeSlug);
  const variant = strike.variants?.[variantIndex];
  if (!variant) {
    throw new Error(`roll-strike: strike "${strikeSlug}" has no variant ${variantIndex.toString()}`);
  }
  // skipDialog: true — suppress PF2e's CheckModifiersDialog (situational modifier
  // prompt). Portal players are explicitly requesting the attack; they
  // don't need a dialog step. Consistent with rollStatisticAction.
  await variant.roll({ skipDialog: true });
  return { ok: true };
}
