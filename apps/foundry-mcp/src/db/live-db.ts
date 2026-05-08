// SQLite persistence + in-process pub/sub for the three live-state datasets:
// party inventory, Aurus combat teams, and globe pins.
//
// Each dataset uses a single-row table (id=1 with a CHECK constraint) for
// full-snapshot overwrite semantics — the DM is always the authority on the
// complete state, and dm-tool sends the whole snapshot on every write.
//
// The subscribe* methods drive the SSE streams in routes/live.ts: when
// set* is called, every subscribed fn is called synchronously with the new
// snapshot so the SSE route can write `data: <json>\n\n` immediately.
//
// Uses node:sqlite (built-in since Node 22.5) instead of better-sqlite3 so
// there is no native addon to compile — no ABI conflicts with Electron.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AurusSnapshot, GlobeSnapshot } from '@foundry-toolkit/shared/rpc';

type SnapshotListener<T> = (snapshot: T) => void;

export class LiveDb {
  private readonly db: DatabaseSync;
  private readonly aurusListeners = new Set<SnapshotListener<AurusSnapshot>>();
  private readonly globeListeners = new Set<SnapshotListener<GlobeSnapshot>>();

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aurus_snapshot (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        data       TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );
      CREATE TABLE IF NOT EXISTS globe_snapshot (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        data       TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );
      CREATE TABLE IF NOT EXISTS item_art_overrides (
        item_slug    TEXT    PRIMARY KEY,
        art_filename TEXT    NOT NULL,
        created_at   INTEGER NOT NULL
      );
    `);
  }

  // ─── Aurus ─────────────────────────────────────────────────────────────────

  getAurus(): AurusSnapshot {
    const row = this.db.prepare('SELECT data FROM aurus_snapshot WHERE id = 1').get() as
      | { data: string }
      | undefined;
    if (!row) return { teams: [], updatedAt: new Date().toISOString() };
    return JSON.parse(row.data) as AurusSnapshot;
  }

  setAurus(snapshot: AurusSnapshot): void {
    this.db
      .prepare('INSERT OR REPLACE INTO aurus_snapshot (id, data, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(snapshot), snapshot.updatedAt);
    for (const fn of this.aurusListeners) fn(snapshot);
  }

  subscribeAurus(fn: SnapshotListener<AurusSnapshot>): () => void {
    this.aurusListeners.add(fn);
    return () => this.aurusListeners.delete(fn);
  }

  // ─── Globe ─────────────────────────────────────────────────────────────────

  getGlobe(): GlobeSnapshot {
    const row = this.db.prepare('SELECT data FROM globe_snapshot WHERE id = 1').get() as
      | { data: string }
      | undefined;
    if (!row) return { pins: [], updatedAt: new Date().toISOString() };
    return JSON.parse(row.data) as GlobeSnapshot;
  }

  setGlobe(snapshot: GlobeSnapshot): void {
    this.db
      .prepare('INSERT OR REPLACE INTO globe_snapshot (id, data, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(snapshot), snapshot.updatedAt);
    for (const fn of this.globeListeners) fn(snapshot);
  }

  subscribeGlobe(fn: SnapshotListener<GlobeSnapshot>): () => void {
    this.globeListeners.add(fn);
    return () => this.globeListeners.delete(fn);
  }

  // ─── Item art overrides ────────────────────────────────────────────────────

  getItemArtOverride(slug: string): { itemSlug: string; artFilename: string; createdAt: number } | null {
    const row = this.db
      .prepare('SELECT item_slug, art_filename, created_at FROM item_art_overrides WHERE item_slug = ?')
      .get(slug) as { item_slug: string; art_filename: string; created_at: number } | undefined;
    if (!row) return null;
    return { itemSlug: row.item_slug, artFilename: row.art_filename, createdAt: row.created_at };
  }

  setItemArtOverride(slug: string, filename: string): void {
    this.db
      .prepare(
        'INSERT INTO item_art_overrides (item_slug, art_filename, created_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(item_slug) DO UPDATE SET art_filename = excluded.art_filename',
      )
      .run(slug, filename, Date.now());
  }

  listItemArtOverrides(): Array<{ itemSlug: string; artFilename: string; createdAt: number }> {
    const rows = this.db
      .prepare('SELECT item_slug, art_filename, created_at FROM item_art_overrides ORDER BY item_slug')
      .all() as Array<{ item_slug: string; art_filename: string; created_at: number }>;
    return rows.map((r) => ({ itemSlug: r.item_slug, artFilename: r.art_filename, createdAt: r.created_at }));
  }

  close(): void {
    this.db.close();
  }
}
