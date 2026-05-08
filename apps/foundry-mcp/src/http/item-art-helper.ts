// Pure helper for substituting item `img` fields with purchased art overrides.
// Operates on the opaque `unknown` values that come back from sendCommand, so
// all casts are intentional and guarded.

import type { LiveDb } from '../db/live-db.js';

/** Apply item art overrides to a response from get-actor-items or get-party-stash.
 *  Mutates nothing — returns a new object with replaced `img` fields. */
export function applyItemArtOverrides(result: unknown, db: LiveDb): unknown {
  if (!result || typeof result !== 'object') return result;

  if (Array.isArray(result)) {
    return result.map((item) => applyOverrideToItem(item, db));
  }

  const obj = result as Record<string, unknown>;

  // Handle {items: [...]} envelope — the most common shape from get-actor-items.
  if (Array.isArray(obj['items'])) {
    return { ...obj, items: (obj['items'] as unknown[]).map((item) => applyOverrideToItem(item, db)) };
  }

  return result;
}

function applyOverrideToItem(item: unknown, db: LiveDb): unknown {
  if (!item || typeof item !== 'object') return item;
  const record = item as Record<string, unknown>;

  const system = record['system'];
  if (!system || typeof system !== 'object') return item;

  const slug = (system as Record<string, unknown>)['slug'];
  if (typeof slug !== 'string' || !slug) return item;

  const override = db.getItemArtOverride(slug);
  if (!override) return item;

  return { ...record, img: `/item-art/${override.artFilename}` };
}
