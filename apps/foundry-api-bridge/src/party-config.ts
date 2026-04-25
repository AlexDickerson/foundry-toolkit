/** Default name of the PF2e `party`-type actor that holds party members.
 *
 *  In PF2e, a dedicated actor with `type === 'party'` (e.g. the built-in
 *  "The Party") owns the list of player characters via its `.members`
 *  property.  Change this one constant if the party actor has been renamed
 *  in your world.  Every party-member query uses it as its default; callers
 *  can still pass an explicit `partyName` to override it at call-time without
 *  touching this file.
 *
 *  NOTE: dm-tool's party-picker-utils.ts mirrors this value for UI
 *  display purposes — keep the two in sync when renaming. */
export const PARTY_ACTOR_NAME = 'The Party';
