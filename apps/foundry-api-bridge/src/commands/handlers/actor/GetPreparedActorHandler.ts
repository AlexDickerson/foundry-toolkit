import type { GetActorParams, PreparedActorResult, ItemSummary } from '@/commands/types';

interface ToObjectable {
  toObject(source: boolean): { system: Record<string, unknown>; flags?: Record<string, Record<string, unknown>> };
}

interface ActorItem extends ToObjectable {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
}

interface ActorItemsCollection {
  forEach(fn: (item: ActorItem) => void): void;
}

interface FoundryActor extends ToObjectable {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string | undefined;
  items: ActorItemsCollection;
  // actor.system is the live post-prepareData object; used selectively to
  // pick up derived fields that toObject(false) may not include.
  system: { resources?: unknown };
}

interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

interface FoundryGame {
  actors: ActorsCollection;
}

function getGame(): FoundryGame {
  return (globalThis as unknown as { game: FoundryGame }).game;
}

// Returns the actor post-prepareData, with derived state merged into `system`
// (final AC value, save modifiers, skill totals, etc.). `toObject(false)` is
// the Foundry API that returns a snapshot including prepared/derived data,
// as opposed to the default `toObject()` which returns only `_source`.
export function getPreparedActorHandler(params: GetActorParams): Promise<PreparedActorResult> {
  const actor = getGame().actors.get(params.actorId);

  if (!actor) {
    return Promise.reject(new Error(`Actor not found: ${params.actorId}`));
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

  const snapshot = actor.toObject(false);
  // PF2e recomputes investiture.value (and potentially other resource
  // counters) in prepareDerivedData. Those mutations live on actor.system
  // and are not always reflected in the toObject(false) snapshot, which may
  // serialise from _source for schema-backed fields. Overlay resources from
  // the live prepared object so callers see the correct derived values.
  snapshot.system['resources'] = actor.system.resources;

  return Promise.resolve({
    id: actor.id,
    uuid: actor.uuid,
    name: actor.name,
    type: actor.type,
    img: actor.img ?? '',
    system: snapshot.system,
    items,
    flags: snapshot.flags ?? {},
  });
}
