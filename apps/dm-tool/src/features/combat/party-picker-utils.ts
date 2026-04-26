/** Default name of the PF2e `party`-type actor that holds party members.
 *
 *  Mirrors `PARTY_ACTOR_NAME` in
 *  `apps/foundry-api-bridge/src/party-config.ts` — keep the two in sync
 *  when renaming.  This copy is used only for display purposes in the
 *  dm-tool UI (error messages, tooltips). */
export const PARTY_ACTOR_NAME = 'The Party';

/** Toggle an id in/out of a selection set.  Pure — returns a new Set,
 *  never mutates the input. */
export function togglePartySelection(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** Returns true when a PC combatant for the given party member is already
 *  present in the encounter. Matches by `foundryActorId` first (robust
 *  against renames), falling back to `displayName` for legacy combatants
 *  added before the foundryActorId field existed. */
export function isAlreadyInEncounter(
  combatants: ReadonlyArray<{ kind: string; displayName: string; foundryActorId?: string }>,
  member: { id: string; name: string },
): boolean {
  return combatants.some((c) => c.kind === 'pc' && (c.foundryActorId === member.id || c.displayName === member.name));
}
