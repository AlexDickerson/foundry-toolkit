import { ipcMain } from 'electron';
import type { MonsterDetail, MonsterSearchParams } from '@foundry-toolkit/shared/types';
import { getPreparedCompendium } from '../compendium/singleton.js';

// Every monster IPC now routes through the foundry-mcp-backed prepared
// compendium. `getPreparedCompendium()` resolves at invocation time so
// a renderer-issued query racing the startup init surfaces a clear
// error instead of a stale reference.

/** Convert a Foundry-relative asset path (e.g. `systems/pf2e/icons/…`) to
 *  a `monster-file://img/<path>` URL that the Electron renderer can load
 *  via the registered protocol handler.
 *
 *  Returns `null` for missing/empty inputs. Leaves already-absolute URLs
 *  (http/https) or `monster-file://` URLs untouched so callers are
 *  idempotent. Encodes `#` and `?` to avoid confusing URL parsers. */
export function toMonsterFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('monster-file://')) return path;
  // Encode characters that URL parsers treat specially.
  const encoded = path.replace(/#/g, '%23').replace(/\?/g, '%3F');
  return `monster-file://img/${encoded}`;
}

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
