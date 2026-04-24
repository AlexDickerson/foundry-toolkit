import { ipcMain } from 'electron';
import type { ItemBrowserDetail, ItemBrowserRow, ItemFacets, ItemSearchParams } from '@foundry-toolkit/shared/types';
import { getPreparedCompendium } from '../compendium/singleton.js';

// Every item IPC now routes through the foundry-mcp-backed prepared
// compendium. `getItemBrowserDetail` reads the full document + parses
// `variants[]` from `system.variants` via the projection layer in
// projection.ts.
export function registerItemHandlers(): void {
  ipcMain.handle('searchItemsBrowser', (_e, params: ItemSearchParams): Promise<ItemBrowserRow[]> => {
    return getPreparedCompendium().searchItemsBrowser(params ?? {});
  });

  ipcMain.handle('getItemBrowserDetail', (_e, id: string): Promise<ItemBrowserDetail | null> => {
    return getPreparedCompendium().getItemBrowserDetail(id);
  });

  ipcMain.handle('getItemFacets', (): Promise<ItemFacets> => {
    return getPreparedCompendium().getItemFacets();
  });
}
