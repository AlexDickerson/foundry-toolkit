// Inventory CRUD + live-sync push to foundry-mcp. SQLite remains the DM's
// source of truth; every mutation fires a best-effort POST so connected
// players see the update in real time. If foundry-mcp is unreachable the
// local write still succeeds.

import { ipcMain } from 'electron';
import type { DmToolConfig } from '../config.js';
import type { PartyInventoryItem } from '@foundry-toolkit/shared/types';
import { deleteInventory, listInventory, upsertInventory } from '@foundry-toolkit/db/pf2e';
import { pushToFoundryMcp } from '../sidecar-client.js';

async function pushSnapshot(cfg: DmToolConfig): Promise<void> {
  await pushToFoundryMcp(
    cfg,
    '/api/live/inventory',
    { items: listInventory(), updatedAt: new Date().toISOString() },
    'inventory',
  );
}

export function registerInventoryHandlers(cfg: DmToolConfig): void {
  ipcMain.handle('inventoryList', (): PartyInventoryItem[] => listInventory());

  ipcMain.handle('inventoryUpsert', async (_e, item: PartyInventoryItem): Promise<void> => {
    upsertInventory(item);
    await pushSnapshot(cfg);
  });

  ipcMain.handle('inventoryDelete', async (_e, id: string): Promise<void> => {
    deleteInventory(id);
    await pushSnapshot(cfg);
  });
}
