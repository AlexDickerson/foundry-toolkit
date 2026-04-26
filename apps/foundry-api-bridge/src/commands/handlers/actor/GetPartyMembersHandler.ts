import type { GetPartyMembersParams, PartyMemberResult } from '@/commands/types';
import { PARTY_ACTOR_NAME } from '@/party-config';

/** Individual actor as a party member — carries system data for stat extraction. */
interface PartyMemberActor {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  system: Record<string, unknown>;
}

/** PF2e party actor (type === 'party').  Exposes linked member actors via
 *  the `.members` iterable — populated by the PF2e system, not available
 *  on other actor types. */
interface FoundryPartyActor {
  id: string;
  name: string;
  type: string;
  members?: Iterable<PartyMemberActor>;
}

interface ActorsCollection {
  forEach(fn: (actor: FoundryPartyActor) => void): void;
}

interface FoundryGame {
  actors: ActorsCollection;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

/** Safely read a numeric value at a nested dot-notation path inside an
 *  actor's `system` object.  Returns `undefined` when any key in the
 *  path is missing or the leaf is not a number. */
function getNestedNumber(obj: Record<string, unknown>, path: string): number | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' ? current : undefined;
}

export function getPartyMembersHandler(params: GetPartyMembersParams): Promise<PartyMemberResult[]> {
  const partyName = params.partyName ?? PARTY_ACTOR_NAME;

  // PF2e worlds use a dedicated actor with type='party' (e.g. "The Party").
  // That actor's `.members` iterable returns the linked player characters.
  let partyActor: FoundryPartyActor | undefined;
  getGame().actors.forEach((a) => {
    if (a.type === 'party' && a.name === partyName) {
      partyActor = a;
    }
  });

  if (!partyActor?.members) {
    return Promise.resolve([]);
  }

  const members: PartyMemberResult[] = [];

  for (const member of partyActor.members) {
    // Party actors can technically contain non-character actors (e.g. familiars
    // in some setups) — only include player characters.
    if (member.type !== 'character') continue;

    const sys = member.system;

    // PF2e remastered: perception modifier lives at system.perception.mod.
    // Pre-remaster: system.attributes.perception.value — try both.
    const initiativeMod =
      getNestedNumber(sys, 'perception.mod') ??
      getNestedNumber(sys, 'attributes.perception.value') ??
      0;

    const maxHp = getNestedNumber(sys, 'attributes.hp.max') ?? 0;
    // Current HP lives at system.attributes.hp.value; default to maxHp if
    // missing so a malformed actor still shows a sensible value.
    const hp = getNestedNumber(sys, 'attributes.hp.value') ?? maxHp;

    members.push({
      id: member.id,
      name: member.name,
      img: member.img ?? '',
      initiativeMod,
      hp,
      maxHp,
    });
  }

  return Promise.resolve(members);
}
