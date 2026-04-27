import type { GetPartyForMemberParams, GetPartyForMemberResult, PartyForMemberMember } from '@/commands/types';
import { PARTY_ACTOR_NAME } from '@/party-config';

interface ConditionItem {
  slug: string;
  system: Record<string, unknown>;
}

/** PF2e character actor shape — carries stat blocks, itemTypes, and (on PF2e
 *  v6+) a `.parties` iterable pointing at the Party actors it belongs to. */
interface CharacterActor {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  system: Record<string, unknown>;
  /** PF2e-specific: Set or Collection of party actors this character belongs to. */
  parties?: Iterable<FoundryPartyActor> | null;
  itemTypes?: {
    condition?: ConditionItem[];
  };
}

interface FoundryPartyActor {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  members?: Iterable<CharacterActor>;
}

interface ActorsCollection {
  get(id: string): CharacterActor | undefined;
  forEach(fn: (actor: FoundryPartyActor) => void): void;
}

interface FoundryGame {
  actors: ActorsCollection;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

function getNestedNumber(obj: Record<string, unknown>, path: string): number | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' ? current : undefined;
}

function getNestedBoolean(obj: Record<string, unknown>, path: string): boolean | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'boolean' ? current : undefined;
}

function buildMember(member: CharacterActor, actorId: string): PartyForMemberMember {
  const sys = member.system;

  const perceptionMod =
    getNestedNumber(sys, 'perception.mod') ?? getNestedNumber(sys, 'attributes.perception.value') ?? 0;

  const hpMax = getNestedNumber(sys, 'attributes.hp.max') ?? 0;
  const hpValue = getNestedNumber(sys, 'attributes.hp.value') ?? hpMax;
  const hpTemp = getNestedNumber(sys, 'attributes.hp.temp') ?? 0;

  const ac = getNestedNumber(sys, 'attributes.ac.value') ?? 0;
  const level = getNestedNumber(sys, 'details.level.value') ?? 0;

  const heroPointsValue = getNestedNumber(sys, 'resources.heroPoints.value') ?? 0;
  const heroPointsMax = getNestedNumber(sys, 'resources.heroPoints.max') ?? 3;

  // Shield: present only when a shield is equipped (max HP > 0 distinguishes
  // the equipped-shield state from the default empty object PF2e always populates).
  const shieldHpMax = getNestedNumber(sys, 'attributes.shield.hp.max') ?? 0;
  const shield =
    shieldHpMax > 0
      ? {
          hpValue: getNestedNumber(sys, 'attributes.shield.hp.value') ?? 0,
          hpMax: shieldHpMax,
          raised: getNestedBoolean(sys, 'attributes.shield.raised') ?? false,
          broken: getNestedBoolean(sys, 'attributes.shield.broken') ?? false,
        }
      : null;

  // Conditions via PF2e's itemTypes.condition — each slug is on the item
  // directly; degree value (frightened 2, sickened 1, etc.) is at system.value.value.
  const conditions = (member.itemTypes?.condition ?? []).map((c) => {
    const raw = (c.system?.['value'] as Record<string, unknown> | undefined)?.['value'];
    return {
      slug: c.slug,
      value: typeof raw === 'number' ? raw : null,
    };
  });

  return {
    id: member.id,
    name: member.name,
    img: member.img ?? '',
    level,
    hp: { value: hpValue, max: hpMax, temp: hpTemp },
    ac,
    perceptionMod,
    heroPoints: { value: heroPointsValue, max: heroPointsMax },
    shield,
    conditions,
    // isOwnedByUser: true for the member whose sheet initiated this request.
    isOwnedByUser: member.id === actorId,
  };
}

export function getPartyForMemberHandler(params: GetPartyForMemberParams): Promise<GetPartyForMemberResult> {
  const { actorId } = params;
  const actors = getGame().actors;

  let partyActor: FoundryPartyActor | undefined;

  // Data-driven path: PF2e v6+ exposes actor.parties (a Set/Collection) on
  // character actors. Use the first entry as the resolved party.
  const characterActor = actors.get(actorId);
  const partiesIterable = characterActor?.parties;

  if (partiesIterable) {
    const firstParty = [...partiesIterable][0];
    if (firstParty) {
      partyActor = firstParty;
      console.info(
        `Foundry API Bridge | getPartyForMember: resolved via actor.parties[0] (partyId=${partyActor.id}, actorId=${actorId})`,
      );
    }
  }

  if (!partyActor) {
    // Fallback: scan all actors for a party actor matching the configured name.
    const partyName = params.partyName ?? PARTY_ACTOR_NAME;
    console.warn(
      `Foundry API Bridge | getPartyForMember: actor.parties not available for actorId=${actorId}; falling back to name lookup ("${partyName}")`,
    );
    actors.forEach((a) => {
      if (a.type === 'party' && a.name === partyName) {
        partyActor = a;
      }
    });
  }

  if (!partyActor?.members) {
    return Promise.resolve({ party: null, members: [] });
  }

  const members: PartyForMemberMember[] = [];
  for (const member of partyActor.members) {
    if (member.type !== 'character') continue;
    members.push(buildMember(member, actorId));
  }

  return Promise.resolve({
    party: {
      id: partyActor.id,
      name: partyActor.name,
      img: partyActor.img ?? '',
    },
    members,
  });
}
