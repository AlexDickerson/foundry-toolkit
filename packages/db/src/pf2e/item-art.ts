// Data-access helpers for the item_art_overrides table.
// Populated by the foundry-mcp seed-item-art CLI; read at request time by
// foundry-mcp to substitute purchased PF2e item-card art in player-portal
// character-sheet responses.

import { getPf2eDb } from './connection.js';

export interface ItemArtOverride {
  itemSlug: string;
  artFilename: string;
  createdAt: number;
}

export function getItemArtOverride(slug: string): ItemArtOverride | null {
  const row = getPf2eDb()
    .prepare('SELECT item_slug, art_filename, created_at FROM item_art_overrides WHERE item_slug = ?')
    .get(slug) as { item_slug: string; art_filename: string; created_at: number } | undefined;
  if (!row) return null;
  return { itemSlug: row.item_slug, artFilename: row.art_filename, createdAt: row.created_at };
}

export function setItemArtOverride(slug: string, filename: string): void {
  getPf2eDb()
    .prepare(
      'INSERT INTO item_art_overrides (item_slug, art_filename, created_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(item_slug) DO UPDATE SET art_filename = excluded.art_filename',
    )
    .run(slug, filename, Date.now());
}

export function listItemArtOverrides(): ItemArtOverride[] {
  const rows = getPf2eDb()
    .prepare('SELECT item_slug, art_filename, created_at FROM item_art_overrides ORDER BY item_slug')
    .all() as Array<{ item_slug: string; art_filename: string; created_at: number }>;
  return rows.map((r) => ({ itemSlug: r.item_slug, artFilename: r.art_filename, createdAt: r.created_at }));
}
