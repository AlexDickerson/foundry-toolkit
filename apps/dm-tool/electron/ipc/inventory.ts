// Inventory CRUD + live-sync push to the sidecar. SQLite remains the DM's
// source of truth; every mutation fires off a best-effort POST to the
// sidecar so connected players see the update in real time. If the sidecar
// is unreachable the local write still succeeds — the next successful push
// will bring the sidecar back in sync.

import { ipcMain } from 'electron';
import type { DmToolConfig } from '../config.js';
import type { PartyInventoryItem } from '@foundry-toolkit/shared/types';
import { deleteInventory, listInventory, upsertInventory } from '@foundry-toolkit/db/pf2e';
import { pushToFoundryMcp, pushToSidecar } from '../sidecar-client.js';

async function pushSnapshot(cfg: DmToolConfig): Promise<void> {
  const payload = { items: listInventory(), updatedAt: new Date().toISOString() };
  await Promise.all([
    pushToSidecar(cfg, '/api/live/inventory', payload, 'inventory'),
    pushToFoundryMcp(cfg, '/api/live/inventory', payload, 'inventory'),
  ]);
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
