import type { GetPartyStashParams, GetPartyStashResult, ItemSummary } from '@/commands/types';

interface ToObjectable {
  toObject(source: boolean): { system: Record<string, unknown> };
}

interface StashItem extends ToObjectable {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
}

interface StashItemsCollection {
  forEach(fn: (item: StashItem) => void): void;
}

interface FoundryPartyActor {
  id: string;
  type: string;
  items: StashItemsCollection;
}

interface ActorsCollection {
  get(id: string): FoundryPartyActor | undefined;
}

interface FoundryGame {
  actors: ActorsCollection;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

export function getPartyStashHandler(params: GetPartyStashParams): Promise<GetPartyStashResult> {
  const actor = getGame().actors.get(params.partyActorId);

  if (!actor) {
    return Promise.reject(new Error(`Party actor not found: ${params.partyActorId}`));
  }

  if (actor.type !== 'party') {
    return Promise.reject(
      new Error(`Actor ${params.partyActorId} is not a party actor (type="${actor.type}")`),
    );
  }

  const items: ItemSummary[] = [];
  actor.items.forEach((item) => {
    items.push({
      id: item.id,
      name: item.name,
      type: item.type,
      img: item.img ?? '',
      system: item.toObject(false).system,
    });
  });

  return Promise.resolve({ items });
}
