// Inventory CRUD — SQLite-backed, DM-facing only.
//
// The live-sync push to foundry-mcp has been retired: players now read the
// Party actor's stash directly from Foundry via getPartyStash. The DM's local
// SQLite inventory remains available for the DM's own reference UI in dm-tool,
// but mutations no longer fan-out to the portal.

import { ipcMain } from 'electron';
import type { PartyInventoryItem } from '@foundry-toolkit/shared/types';
import { deleteInventory, listInventory, upsertInventory } from '@foundry-toolkit/db/pf2e';

export function registerInventoryHandlers(): void {
  ipcMain.handle('inventoryList', (): PartyInventoryItem[] => listInventory());

  ipcMain.handle('inventoryUpsert', (_e, item: PartyInventoryItem): void => {
    upsertInventory(item);
  });

  ipcMain.handle('inventoryDelete', (_e, id: string): void => {
    deleteInventory(id);
  });
}
