// IPC for the dm-tool item-browser's homebrew creator.
//
// The renderer drives a three-step flow:
//   1. (Optional) `getCompendiumItemTemplate(uuid)` — fetch the full Foundry
//      document for an item the user wants to clone, with identity fields
//      (`_id`, `_stats`, embedded `_id`s) stripped so the renderer can
//      present a fresh editable draft.
//   2. `ensureHomebrewItemPack({name, label})` — idempotent create of the
//      target world pack on first save.
//   3. `createHomebrewItem({packId, item})` — write the item into the
//      pack and return the new document's id + uuid.
//
// All three handlers proxy through the existing CompendiumApi singleton,
// so they share the configured foundry-mcp URL with the rest of the app.

import { ipcMain } from 'electron';
import type {
  CompendiumItemPayload,
  CreateCompendiumItemResponse,
  EnsureCompendiumPackBody,
  EnsureCompendiumPackResponse,
} from '@foundry-toolkit/shared/rpc';
import type { CompendiumDocument } from '../compendium/types.js';
import { getCompendiumApi, isPreparedCompendiumInitialized } from '../compendium/singleton.js';

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

export function registerHomebrewItemHandlers(): void {
  ipcMain.handle('getCompendiumItemTemplate', async (_e, uuid: string): Promise<CompendiumItemTemplate> => {
    if (!isPreparedCompendiumInitialized()) {
      throw new Error('Compendium API not available — set a foundry-mcp URL in Settings → Paths and restart the app.');
    }
    if (typeof uuid !== 'string' || uuid.length === 0) {
      throw new Error('getCompendiumItemTemplate: uuid must be a non-empty string');
    }
    const { document } = await getCompendiumApi().getCompendiumDocument(uuid);
    return stripIdentityForClone(document);
  });

  ipcMain.handle(
    'ensureHomebrewItemPack',
    (_e, body: EnsureCompendiumPackBody): Promise<EnsureCompendiumPackResponse> => {
      if (!isPreparedCompendiumInitialized()) {
        throw new Error(
          'Compendium API not available — set a foundry-mcp URL in Settings → Paths and restart the app.',
        );
      }
      return getCompendiumApi().ensureCompendiumPack(body);
    },
  );

  ipcMain.handle(
    'createHomebrewItem',
    (_e, payload: { packId: string; item: CompendiumItemPayload }): Promise<CreateCompendiumItemResponse> => {
      if (!isPreparedCompendiumInitialized()) {
        throw new Error(
          'Compendium API not available — set a foundry-mcp URL in Settings → Paths and restart the app.',
        );
      }
      return getCompendiumApi().createCompendiumItem(payload);
    },
  );
}
