import type { ActorSummary } from '../api/types';

/** Returns true only for PF2e player-character actors (`type === 'character'`).
 *  Used to exclude NPCs, familiars, loot containers, vehicles, and party
 *  actors from the character list. The primary filter is applied at the
 *  foundry-api-bridge level so the wire payload stays small; this helper
 *  provides a defensive second layer in the UI and a testable predicate. */
export function isPlayerCharacter(actor: Pick<ActorSummary, 'type'>): boolean {
  return actor.type === 'character';
}
