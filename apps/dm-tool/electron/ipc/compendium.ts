// IPC for Settings → Compendium configuration.
//
// Three handlers:
//   - `compendiumListPacks(documentType?)` proxies foundry-mcp's
//     `GET /api/compendium/packs` so the Settings dialog can render a
//     live list of packs the user's Foundry actually has installed.
//   - `compendiumGetMonsterPackIds()` returns the currently-active
//     list (user override OR defaults).
//   - `compendiumSetMonsterPackIds(ids)` persists a new override and
//     invalidates any memoized facets that depended on the prior scope.
//
// These are thin — the heavy lifting lives in
// `electron/compendium/singleton.ts` and the `CompendiumApi` wired up
// there.

import { ipcMain } from 'electron';
import type { CompendiumPack } from '../compendium/index.js';
import { DEFAULT_MONSTER_PACK_IDS } from '../compendium/prepared.js';
import {
  getCompendiumApi,
  isPreparedCompendiumInitialized,
  readMonsterPackIds,
  writeMonsterPackIds,
} from '../compendium/singleton.js';

export function registerCompendiumHandlers(): void {
  ipcMain.handle('compendiumListPacks', async (_e, documentType?: string): Promise<CompendiumPack[]> => {
    if (!isPreparedCompendiumInitialized()) {
      throw new Error('Compendium API not available — set a foundry-mcp URL in Settings → Paths and restart the app.');
    }
    const { packs } = await getCompendiumApi().listCompendiumPacks(
      documentType !== undefined ? { documentType } : undefined,
    );
    return packs;
  });

  ipcMain.handle('compendiumGetMonsterPackIds', (): string[] => {
    return [...readMonsterPackIds()];
  });

  ipcMain.handle('compendiumSetMonsterPackIds', (_e, ids: string[]): string[] => {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      throw new Error('compendiumSetMonsterPackIds: ids must be a string[]');
    }
    writeMonsterPackIds(ids);
    // Echo the value readMonsterPackIds would return next — an empty
    // input resolves to the defaults, so the renderer can update its
    // local state without a follow-up read.
    return [...readMonsterPackIds()];
  });

  ipcMain.handle('compendiumGetDefaultMonsterPackIds', (): string[] => {
    return [...DEFAULT_MONSTER_PACK_IDS];
  });
}
