import { ipcMain } from 'electron';
import type { MonsterDetail, MonsterSearchParams } from '@foundry-toolkit/shared/types';
import { getPreparedCompendium } from '../compendium/singleton.js';
import { toMonsterFileUrl } from '../compendium/image-url.js';

// Every monster IPC now routes through the foundry-mcp-backed prepared
// compendium. `getPreparedCompendium()` resolves at invocation time so
// a renderer-issued query racing the startup init surfaces a clear
// error instead of a stale reference.

/** Rewrite imageUrl / tokenUrl on a MonsterDetail so the renderer can
 *  load them directly via the registered monster-file:// protocol. */
function rewriteImageUrls(detail: MonsterDetail): MonsterDetail {
  return {
    ...detail,
    imageUrl: toMonsterFileUrl(detail.imageUrl),
    tokenUrl: toMonsterFileUrl(detail.tokenUrl),
  };
}

export function registerMonsterHandlers(): void {
  ipcMain.handle('monstersSearch', (_e, params: MonsterSearchParams) => {
    return getPreparedCompendium().listMonsters(params ?? {});
  });

  ipcMain.handle('monstersFacets', () => {
    return getPreparedCompendium().getMonsterFacets();
  });

  ipcMain.handle('monstersGetDetail', (_e, name: string) => {
    return getPreparedCompendium()
      .getMonsterByName(name)
      .then((d) => (d ? rewriteImageUrls(d) : null));
  });
}
