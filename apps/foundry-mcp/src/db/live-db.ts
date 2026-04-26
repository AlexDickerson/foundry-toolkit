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
import type { AurusSnapshot, GlobeSnapshot, InventorySnapshot } from '@foundry-toolkit/shared/rpc';

type SnapshotListener<T> = (snapshot: T) => void;

export class LiveDb {
  private readonly db: DatabaseSync;
  private readonly inventoryListeners = new Set<SnapshotListener<InventorySnapshot>>();
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
      CREATE TABLE IF NOT EXISTS inventory_snapshot (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        data       TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );
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
    `);
  }

  // ─── Inventory ─────────────────────────────────────────────────────────────

  getInventory(): InventorySnapshot {
    const row = this.db.prepare('SELECT data FROM inventory_snapshot WHERE id = 1').get() as
      | { data: string }
      | undefined;
    if (!row) return { items: [], updatedAt: new Date().toISOString() };
    return JSON.parse(row.data) as InventorySnapshot;
  }

  setInventory(snapshot: InventorySnapshot): void {
    this.db
      .prepare('INSERT OR REPLACE INTO inventory_snapshot (id, data, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(snapshot), snapshot.updatedAt);
    for (const fn of this.inventoryListeners) fn(snapshot);
  }

  subscribeInventory(fn: SnapshotListener<InventorySnapshot>): () => void {
    this.inventoryListeners.add(fn);
    return () => this.inventoryListeners.delete(fn);
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

  close(): void {
    this.db.close();
  }
}
