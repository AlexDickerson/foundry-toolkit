import { ipcMain } from 'electron';
import type { MonsterSearchParams } from '@foundry-toolkit/shared/types';
import { listMonsters, getMonsterFacets } from '@foundry-toolkit/db/pf2e';
import { getPreparedCompendium } from '../compendium/singleton.js';

export function registerMonsterHandlers(): void {
  ipcMain.handle('monstersSearch', (_e, params: MonsterSearchParams) => {
    return listMonsters(params ?? {});
  });

  ipcMain.handle('monstersFacets', () => {
    return getMonsterFacets();
  });

  // monstersGetDetail — single-name lookup for the Monster Detail pane.
  // Now backed by foundry-mcp via the prepared-compendium facade.
  ipcMain.handle('monstersGetDetail', (_e, name: string) => {
    return getPreparedCompendium().getMonsterByName(name);
  });
}
