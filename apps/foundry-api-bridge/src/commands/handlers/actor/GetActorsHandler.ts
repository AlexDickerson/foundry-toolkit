import type { ActorSummary } from '@/commands/types';

interface PartyRef {
  id: string;
  name: string;
}

interface ActorEntry {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  flags?: Record<string, Record<string, unknown>>;
  /** PF2e populates this with a Set of party actors the character belongs
   *  to. Empty/absent when the character isn't in any party. */
  parties?: Iterable<PartyRef>;
}

interface ActorsCollection {
  forEach(fn: (actor: ActorEntry) => void): void;
}

interface FoundryGame {
  actors: ActorsCollection;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

// Reduce the PF2e parties Set to a single { id, name } ref — the first
// party the character belongs to. Returns null when the character is
// unaffiliated. The vast majority of characters are in 0 or 1 party.
function firstParty(parties: Iterable<PartyRef> | undefined): PartyRef | null {
  if (!parties) return null;
  for (const p of parties) {
    if (typeof p.id === 'string' && typeof p.name === 'string') return { id: p.id, name: p.name };
  }
  return null;
}

export function getActorsHandler(_params: Record<string, never>): Promise<ActorSummary[]> {
  const actors: ActorSummary[] = [];

  getGame().actors.forEach((actor) => {
    // Only return PF2e player-character actors. NPCs, familiars, loot
    // containers, vehicles, and party actors are not relevant to the
    // player portal's character list.
    if (actor.type !== 'character') return;

    actors.push({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img ?? '',
      ...(actor.flags !== undefined ? { flags: actor.flags } : {}),
      party: firstParty(actor.parties),
    });
  });

  return Promise.resolve(actors);
}
