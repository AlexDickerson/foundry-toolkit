// Pure helper for substituting item `img` fields with purchased art overrides.
// Operates on the opaque `unknown` values that come back from sendCommand, so
// all casts are intentional and guarded.
//
// Reads from pf2e.db via the @foundry-toolkit/db singleton. When PF2E_DB_PATH
// is not configured (isPf2eDbOpen() returns false) the function is a no-op,
// so the feature degrades cleanly with no configuration required.

import { isPf2eDbOpen, getItemArtOverride } from '@foundry-toolkit/db/pf2e';

/** Apply item art overrides to a response from get-actor-items or get-party-stash.
 *  Mutates nothing — returns a new object with replaced `img` fields. */
export function applyItemArtOverrides(result: unknown): unknown {
  if (!isPf2eDbOpen()) return result;
  if (!result || typeof result !== 'object') return result;

  if (Array.isArray(result)) {
    return result.map(applyOverrideToItem);
  }

  const obj = result as Record<string, unknown>;

  // Handle {items: [...]} envelope — the most common shape from get-actor-items.
  if (Array.isArray(obj['items'])) {
    return { ...obj, items: (obj['items'] as unknown[]).map(applyOverrideToItem) };
  }

  return result;
}

function readSlug(item: Record<string, unknown>): string | null {
  // Two response shapes from the bridge:
  //   ItemSummary (party-stash): { ..., system: { slug, ... } }
  //   ItemDetailSummary (get-actor-items): { ..., slug, ... }   ← slug hoisted
  const system = item['system'];
  if (system && typeof system === 'object') {
    const s = (system as Record<string, unknown>)['slug'];
    if (typeof s === 'string' && s) return s;
  }
  const top = item['slug'];
  if (typeof top === 'string' && top) return top;
  return null;
}

function applyOverrideToItem(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const record = item as Record<string, unknown>;

  const slug = readSlug(record);
  if (!slug) return item;

  const override = getItemArtOverride(slug);
  if (!override) return item;

  return { ...record, img: `/item-art/${override.artFilename}` };
}
