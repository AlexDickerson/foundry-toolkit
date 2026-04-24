import { ipcMain } from 'electron';
import type { ItemBrowserDetail, ItemBrowserRow, ItemFacets, ItemSearchParams } from '@foundry-toolkit/shared/types';
import { getItemBrowserDetail } from '@foundry-toolkit/db/pf2e';
import { getPreparedCompendium } from '../compendium/singleton.js';

// Item browser list + facets now route through the foundry-mcp-backed
// prepared compendium. `getItemBrowserDetail` still reads SQLite — it
// migrates in Phase 4 so the detail projection (incl. `variants[]`)
// can be reviewed as a separate unit.
export function registerItemHandlers(): void {
  ipcMain.handle('searchItemsBrowser', (_e, params: ItemSearchParams): Promise<ItemBrowserRow[]> => {
    return getPreparedCompendium().searchItemsBrowser(params ?? {});
  });

  ipcMain.handle('getItemBrowserDetail', (_e, id: string): ItemBrowserDetail | null => {
    return getItemBrowserDetail(id);
  });

  ipcMain.handle('getItemFacets', (): Promise<ItemFacets> => {
    return getPreparedCompendium().getItemFacets();
  });
}
