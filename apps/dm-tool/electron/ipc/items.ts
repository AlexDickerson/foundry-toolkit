import { ipcMain } from 'electron';
import type { ItemBrowserDetail, ItemBrowserRow, ItemFacets, ItemSearchParams } from '@foundry-toolkit/shared/types';
import { getPreparedCompendium } from '../compendium/singleton.js';
import { toMonsterFileUrl } from '../compendium/image-url.js';

function rewriteImg<T extends { img?: string | null }>(item: T, mcpBaseUrl: string | undefined): T {
  return { ...item, img: toMonsterFileUrl(item.img, mcpBaseUrl) };
}

// Every item IPC now routes through the foundry-mcp-backed prepared
// compendium. `getItemBrowserDetail` reads the full document + parses
// `variants[]` from `system.variants` via the projection layer in
// projection.ts.
export function registerItemHandlers(foundryMcpUrl?: string): void {
  ipcMain.handle('searchItemsBrowser', (_e, params: ItemSearchParams): Promise<ItemBrowserRow[]> => {
    return getPreparedCompendium()
      .searchItemsBrowser(params ?? {})
      .then((rows) => rows.map((row) => rewriteImg(row, foundryMcpUrl)));
  });

  ipcMain.handle('getItemBrowserDetail', (_e, id: string): Promise<ItemBrowserDetail | null> => {
    return getPreparedCompendium()
      .getItemBrowserDetail(id)
      .then((d) => (d ? rewriteImg(d, foundryMcpUrl) : null));
  });

  ipcMain.handle('getItemFacets', (): Promise<ItemFacets> => {
    return getPreparedCompendium().getItemFacets();
  });
}
