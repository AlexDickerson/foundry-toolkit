import type { InvokeActorActionResult } from '@/commands/types';
import { resolveStrike } from './_shared';
import type { FoundryActor } from './types';

// Rolls either regular damage or critical damage for a strike
// (whichever was appropriate for the attack outcome). Critical vs.
// normal is client-driven since the SPA reads the outcome from the
// attack's chat card.

export async function rollStrikeDamageAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  if (actor.type !== 'character') {
    throw new Error(`roll-strike-damage: actor ${actor.id} is a ${actor.type}, not a character`);
  }
  const strikeSlug = params['strikeSlug'];
  if (typeof strikeSlug !== 'string' || strikeSlug.length === 0) {
    throw new Error('roll-strike-damage: params.strikeSlug is required');
  }
  const critical = params['critical'] === true;

  const strike = resolveStrike(actor, strikeSlug);
  // DamageModifierDialog is suppressed via the renderDamageModifierDialog hook
  // in prompt-intercept.ts — skipDialog is NOT in DamageRollParams so passing
  // it here has no effect. The hook handles it unconditionally.
  if (critical) {
    if (typeof strike.critical !== 'function') {
      throw new Error(`roll-strike-damage: strike "${strikeSlug}" has no critical roll`);
    }
    await strike.critical({});
  } else {
    if (typeof strike.damage !== 'function') {
      throw new Error(`roll-strike-damage: strike "${strikeSlug}" has no damage roll`);
    }
    await strike.damage({});
  }
  return { ok: true };
}
