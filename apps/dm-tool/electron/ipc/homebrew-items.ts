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
//
// `stripIdentityForClone` + the `CompendiumItemTemplate` type live in a
// sibling helper file so unit tests + the renderer can import them
// without dragging in `electron` (vitest can't load the native binary
// in headless CI).

import { ipcMain } from 'electron';
import type {
  CompendiumItemPayload,
  CreateCompendiumItemResponse,
  EnsureCompendiumPackBody,
  EnsureCompendiumPackResponse,
} from '@foundry-toolkit/shared/rpc';
import { getCompendiumApi, isPreparedCompendiumInitialized } from '../compendium/singleton.js';
import { stripIdentityForClone, type CompendiumItemTemplate } from './homebrew-items-clone.js';

export type { CompendiumItemTemplate } from './homebrew-items-clone.js';

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
