import { ipcMain } from 'electron';
import type { MonsterSearchParams } from '@foundry-toolkit/shared/types';
import { getPreparedCompendium } from '../compendium/singleton.js';

// Every monster IPC now routes through the foundry-mcp-backed prepared
// compendium. `getPreparedCompendium()` resolves at invocation time so
// a renderer-issued query racing the startup init surfaces a clear
// error instead of a stale reference.
export function registerMonsterHandlers(): void {
  ipcMain.handle('monstersSearch', (_e, params: MonsterSearchParams) => {
    return getPreparedCompendium().listMonsters(params ?? {});
  });

  ipcMain.handle('monstersFacets', () => {
    return getPreparedCompendium().getMonsterFacets();
  });

  ipcMain.handle('monstersGetDetail', (_e, name: string) => {
    return getPreparedCompendium().getMonsterByName(name);
  });
}
