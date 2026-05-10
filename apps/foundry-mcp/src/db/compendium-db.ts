// SQLite persistence for warmed compendium pack data.
//
// Compendium packs (bestiary, equipment-srd, feats-srd, …) change only when
// the GM applies a PF2e system update or installs new content — rarely, and
// always intentionally. Persisting the warm cache across restarts means
// foundry-mcp can serve search/facet requests instantly after a restart
// without waiting for a dump-compendium-pack round-trip per pack.
//
// Schema: one row per pack, storing the serialised document array and enough
// metadata to log a useful message on load. The data column is written once
// per warm and read back verbatim — no in-place mutation.
//
// Thread safety: DatabaseSync (node:sqlite) is synchronous and single-threaded;
// all reads/writes happen on the main event-loop thread.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CompendiumDocument } from '../http/compendium-types.js';

export interface CachedPackRow {
  packId: string;
  packLabel: string;
  documents: CompendiumDocument[];
  warmedAt: number; // Unix ms timestamp
}

export class CompendiumDb {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compendium_cache (
        pack_id    TEXT PRIMARY KEY,
        pack_label TEXT NOT NULL,
        data       TEXT NOT NULL,
        warmed_at  INTEGER NOT NULL
      )
    `);
  }

  get(packId: string): CachedPackRow | null {
    const row = this.db
      .prepare('SELECT pack_id, pack_label, data, warmed_at FROM compendium_cache WHERE pack_id = ?')
      .get(packId) as { pack_id: string; pack_label: string; data: string; warmed_at: number } | undefined;
    if (!row) return null;
    return {
      packId: row.pack_id,
      packLabel: row.pack_label,
      documents: JSON.parse(row.data) as CompendiumDocument[],
      warmedAt: row.warmed_at,
    };
  }

  set(packId: string, packLabel: string, documents: CompendiumDocument[]): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO compendium_cache (pack_id, pack_label, data, warmed_at) VALUES (?, ?, ?, ?)',
      )
      .run(packId, packLabel, JSON.stringify(documents), Date.now());
  }

  // Remove one pack's cache entry, or clear the entire table when packId is omitted.
  clear(packId?: string): void {
    if (packId !== undefined) {
      this.db.prepare('DELETE FROM compendium_cache WHERE pack_id = ?').run(packId);
    } else {
      this.db.exec('DELETE FROM compendium_cache');
    }
  }

  list(): string[] {
    const rows = this.db.prepare('SELECT pack_id FROM compendium_cache').all() as { pack_id: string }[];
    return rows.map((r) => r.pack_id);
  }
}
