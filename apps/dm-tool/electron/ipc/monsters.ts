import { ipcMain } from 'electron';
import type { MonsterSearchParams } from '@foundry-toolkit/shared/types';
import { listMonsters, getMonsterFacets, getMonsterByName } from '@foundry-toolkit/db/pf2e';

export function registerMonsterHandlers(): void {
  ipcMain.handle('monstersSearch', (_e, params: MonsterSearchParams) => {
    return listMonsters(params ?? {});
  });

  ipcMain.handle('monstersFacets', () => {
    return getMonsterFacets();
  });

  ipcMain.handle('monstersGetDetail', (_e, name: string) => {
    return getMonsterByName(name);
  });
}
