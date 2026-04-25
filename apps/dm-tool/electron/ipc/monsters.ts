import { ipcMain } from 'electron';
import type { MonsterDetail, MonsterSearchParams } from '@foundry-toolkit/shared/types';
import { getPreparedCompendium } from '../compendium/singleton.js';
import { toMonsterFileUrl } from '../compendium/image-url.js';

// Every monster IPC now routes through the foundry-mcp-backed prepared
// compendium. `getPreparedCompendium()` resolves at invocation time so
// a renderer-issued query racing the startup init surfaces a clear
// error instead of a stale reference.

/** Rewrite imageUrl / tokenUrl on a MonsterDetail so the renderer can load
 *  them. When foundryMcpUrl is configured the image is served through
 *  foundry-mcp's asset proxy (preferred). Otherwise falls back to the
 *  monster-file:// Electron protocol. */
function rewriteImageUrls(detail: MonsterDetail, mcpBaseUrl: string | undefined): MonsterDetail {
  return {
    ...detail,
    imageUrl: toMonsterFileUrl(detail.imageUrl, mcpBaseUrl),
    tokenUrl: toMonsterFileUrl(detail.tokenUrl, mcpBaseUrl),
  };
}

export function registerMonsterHandlers(foundryMcpUrl?: string): void {
  ipcMain.handle('monstersSearch', (_e, params: MonsterSearchParams) => {
    return getPreparedCompendium().listMonsters(params ?? {});
  });

  ipcMain.handle('monstersFacets', () => {
    return getPreparedCompendium().getMonsterFacets();
  });

  ipcMain.handle('monstersGetDetail', (_e, name: string) => {
    return getPreparedCompendium()
      .getMonsterByName(name)
      .then((d) => (d ? rewriteImageUrls(d, foundryMcpUrl) : null));
  });
}
