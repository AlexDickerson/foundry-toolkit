import type { GetActorParams, PreparedActorResult, ItemSummary, StatusEffectEntry } from '@/commands/types';

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

// Conditions with dedicated steppers — excluded from statusEffects.
const STEPPER_CONDITIONS = new Set(['dying', 'wounded', 'doomed']);

function normalizeStatusEffect(item: ActorItem, sys: Record<string, unknown>): StatusEffectEntry | null {
  if (item.type !== 'condition' && item.type !== 'effect') return null;

  const slug = typeof sys['slug'] === 'string' ? sys['slug'] : '';

  if (item.type === 'condition' && STEPPER_CONDITIONS.has(slug)) return null;

  const entry: StatusEffectEntry = {
    id: item.id,
    name: item.name,
    slug,
    img: item.img ?? '',
    fromSpell: item.type === 'effect' && (sys['fromSpell'] as boolean | undefined) === true,
  };

  const rawBadge: unknown = sys['badge'];
  if (rawBadge !== null && typeof rawBadge === 'object' && !Array.isArray(rawBadge)) {
    const badge = rawBadge as Record<string, unknown>;
    const bType = badge['type'];
    const bValue = badge['value'];
    if ((bType === 'value' || bType === 'counter') && typeof bValue === 'number') {
      entry.badge = { type: bType, value: bValue };
    }
  }

  const rawDesc: unknown = sys['description'];
  if (rawDesc !== null && typeof rawDesc === 'object' && !Array.isArray(rawDesc)) {
    const descObj = rawDesc as Record<string, unknown>;
    const descValue: unknown = descObj['value'];
    if (typeof descValue === 'string' && descValue.length > 0) {
      // Replace line-break tags with a space before stripping other tags so
      // adjacent sentences don't run together (e.g. "foo.<br/>bar" → "foo. bar").
      const plain = descValue.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (plain.length > 0) entry.description = plain;
    }
  }

  return entry;
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
  const statusEffects: StatusEffectEntry[] = [];

  actor.items.forEach((item) => {
    const obj = item.toObject(false);
    items.push({
      id: item.id,
      name: item.name,
      type: item.type,
      img: item.img ?? '',
      system: obj.system,
    });
    const effect = normalizeStatusEffect(item, obj.system);
    if (effect !== null) statusEffects.push(effect);
  });

  const snapshot = actor.toObject(false);

  return Promise.resolve({
    id: actor.id,
    uuid: actor.uuid,
    name: actor.name,
    type: actor.type,
    img: actor.img ?? '',
    system: snapshot.system,
    items,
    statusEffects,
    flags: snapshot.flags ?? {},
  });
}
