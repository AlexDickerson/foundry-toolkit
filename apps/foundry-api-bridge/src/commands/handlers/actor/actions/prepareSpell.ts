import type { InvokeActorActionResult } from '@/commands/types';
import type { FoundryActor, Pf2eActorWithSpells, Pf2eSpellItem } from './types';

// PF2e's spellcasting entry surface includes prepareSpell:
//   entry.prepareSpell(spell, groupId, slotIndex)
//     spell:     spell item document (null clears the slot)
//     groupId:   rank string ('1', '2', …) or 'cantrips' for rank-0
//     slotIndex: index inside system.slots.slot{N}.prepared
//
// The DM sheet calls this on drag-and-drop. We expose the same surface
// so the player portal can offer click/drag-prepare for prepared casters.
interface Pf2eSpellcastingEntryWithPrepare {
  prepareSpell(spell: Pf2eSpellItem | null, groupId: string, slotIndex: number): Promise<unknown>;
}

export async function prepareSpellAction(
  actor: FoundryActor,
  params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const entryId = params['entryId'];
  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new Error('prepare-spell: params.entryId is required');
  }
  const rank = params['rank'];
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 0 || rank > 11) {
    throw new Error('prepare-spell: params.rank must be an integer 0..11');
  }
  const slotIndex = params['slotIndex'];
  if (typeof slotIndex !== 'number' || !Number.isInteger(slotIndex) || slotIndex < 0) {
    throw new Error('prepare-spell: params.slotIndex must be a non-negative integer');
  }
  // spellId null/undefined clears the slot; a string preps that spell.
  const rawSpellId = params['spellId'];
  const spellId =
    typeof rawSpellId === 'string' && rawSpellId.length > 0 ? rawSpellId : null;

  const pf2eActor = actor as Pf2eActorWithSpells;
  if (!pf2eActor.spellcasting) {
    throw new Error(`prepare-spell: actor ${actor.id} has no spellcasting ability`);
  }
  const entry = pf2eActor.spellcasting.get(entryId) as Pf2eSpellcastingEntryWithPrepare | undefined;
  if (!entry) {
    throw new Error(`prepare-spell: spellcasting entry '${entryId}' not found on actor ${actor.id}`);
  }

  let spell: Pf2eSpellItem | null = null;
  if (spellId !== null) {
    const found = actor.items.get(spellId);
    if (!found) {
      throw new Error(`prepare-spell: spell item '${spellId}' not found on actor ${actor.id}`);
    }
    spell = found as unknown as Pf2eSpellItem;
  }

  const groupId = rank === 0 ? 'cantrips' : rank.toString();

  console.info(
    `Foundry API Bridge | prepare-spell: actorId=${actor.id.slice(0, 8)} entryId=${entryId.slice(0, 8)} rank=${rank.toString()} slotIndex=${slotIndex.toString()} spellId=${spellId === null ? 'null' : spellId.slice(0, 8)}`,
  );

  try {
    await entry.prepareSpell(spell, groupId, slotIndex);
  } catch (error) {
    console.error(
      `Foundry API Bridge | prepare-spell failed: actorId=${actor.id.slice(0, 8)} entryId=${entryId.slice(0, 8)}`,
      error,
    );
    throw error;
  }

  return { ok: true };
}
