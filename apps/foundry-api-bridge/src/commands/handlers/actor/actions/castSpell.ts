import type { InvokeActorActionResult } from '@/commands/types';
import type { FoundryActor, Pf2eActorWithSpells, Pf2eSpellItem } from './types';

// Calls entry.cast(spell, { rank }) via the spellcasting entry item on
// the actor. The DamageModifierDialog and CheckModifiersDialog are
// already suppressed globally by prompt-intercept.ts, so they never
// block the cast flow. If a PickAThingPrompt fires (e.g. variable
// spell targets) it is relayed to any connected WebSocket client.

export async function castSpellAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const entryId = params['entryId'];
  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new Error('cast-spell: params.entryId is required');
  }
  const spellId = params['spellId'];
  if (typeof spellId !== 'string' || spellId.length === 0) {
    throw new Error('cast-spell: params.spellId is required');
  }
  const rank = params['rank'];
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 0) {
    throw new Error('cast-spell: params.rank must be a non-negative integer');
  }

  const pf2eActor = actor as Pf2eActorWithSpells;
  if (!pf2eActor.spellcasting) {
    throw new Error(`cast-spell: actor ${actor.id} has no spellcasting ability`);
  }

  const entry = pf2eActor.spellcasting.get(entryId);
  if (!entry) {
    throw new Error(`cast-spell: spellcasting entry '${entryId}' not found on actor ${actor.id}`);
  }

  const spell = actor.items.get(spellId);
  if (!spell) {
    throw new Error(`cast-spell: spell item '${spellId}' not found on actor ${actor.id}`);
  }

  console.info(
    `Foundry API Bridge | cast-spell: actorId=${actor.id.slice(0, 8)} entryId=${entryId.slice(0, 8)} spellId=${spellId.slice(0, 8)} rank=${rank.toString()}`,
  );

  try {
    await entry.cast(spell as unknown as Pf2eSpellItem, { rank });
  } catch (error) {
    console.error(
      `Foundry API Bridge | cast-spell failed: actorId=${actor.id.slice(0, 8)} spellId=${spellId.slice(0, 8)}`,
      error,
    );
    throw error;
  }

  return { ok: true };
}
