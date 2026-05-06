// Pure clone-helper for the homebrew item editor. Lives in its own file
// (not alongside `homebrew-items.ts`) because that file pulls in
// `ipcMain` from `electron`, which can't load headlessly in vitest CI.
// The helper-only module has no electron dependency, so the test for
// it (and the renderer code that wants the `CompendiumItemTemplate`
// type) can import it without lighting up the native electron binary.

import type { CompendiumDocument } from '../compendium/types.js';

/** Shape returned by `getCompendiumItemTemplate`. Slimmer than the raw
 *  bridge document — we only need the fields the editor will populate. */
export interface CompendiumItemTemplate {
  name: string;
  type: string;
  img: string | null;
  system: Record<string, unknown>;
  effects: Array<Record<string, unknown>>;
  flags: Record<string, Record<string, unknown>>;
}

/** Strip identity / system-bookkeeping fields from a Foundry item
 *  document so the result can be re-submitted as a brand-new doc.
 *  The dropped keys mirror what `compendiumItem.toObject()` would
 *  reset on a `delete itemData['_id']` clone — but we do it on the
 *  client because the bridge already returns the full object. */
export function stripIdentityForClone(doc: CompendiumDocument): CompendiumItemTemplate {
  const system = typeof doc.system === 'object' && doc.system !== null ? (doc.system as Record<string, unknown>) : {};

  // Foundry documents may carry `effects` directly OR via `toObject` shape.
  const rawEffects = (doc as unknown as { effects?: unknown }).effects;
  const effects: Array<Record<string, unknown>> = Array.isArray(rawEffects)
    ? rawEffects
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e) => {
          const copy = { ...e };
          delete copy['_id'];
          delete copy['_stats'];
          // Embedded ActiveEffect docs sometimes carry their own origin
          // pointing at the source item — drop it so the cloned effect
          // reattaches to the new item rather than referencing the
          // template's uuid.
          delete copy['origin'];
          return copy;
        })
    : [];

  const rawFlags = (doc as unknown as { flags?: unknown }).flags;
  const flags: Record<string, Record<string, unknown>> = typeof rawFlags === 'object' && rawFlags !== null
    ? Object.fromEntries(
        Object.entries(rawFlags as Record<string, unknown>).filter(
          (entry): entry is [string, Record<string, unknown>] => typeof entry[1] === 'object' && entry[1] !== null,
        ),
      )
    : {};

  return {
    name: doc.name,
    type: doc.type,
    img: doc.img !== '' ? doc.img : null,
    system,
    effects,
    flags,
  };
}
