// Lazy cache of foundry-mcp compendium documents, one row per uuid. Writes
// happen on every successful HTTP fetch; reads are cache-first with a TTL.
// The HTTP client in apps/dm-tool/electron/compendium owns the fetch
// fall-through; this module only speaks to SQLite.
//
// Table shape (see migrations.ts):
//   pf2e_compendium_docs(uuid TEXT PK, fetched_at INTEGER, body_json TEXT)
//
// Callers pass an arbitrary document shape as the body; the cache doesn't
// introspect it. The HTTP layer re-parses on the way out.

import { getPf2eDb } from './connection.js';

export interface CachedDocument<T> {
  uuid: string;
  fetchedAt: number;
  body: T;
}

interface Row {
  uuid: string;
  fetched_at: number;
  body_json: string;
}

/** Look up a cached document by uuid. Returns null when absent OR when the
 *  row is older than maxAgeMs. The stale path (past TTL) is exposed via
 *  getCachedDocumentAllowStale for graceful degradation on HTTP failures. */
export function getCachedDocument<T>(uuid: string, maxAgeMs: number): CachedDocument<T> | null {
  const row = getPf2eDb().prepare('SELECT uuid, fetched_at, body_json FROM pf2e_compendium_docs WHERE uuid = ?').get(
    uuid,
  ) as Row | undefined;
  if (!row) return null;
  if (Date.now() - row.fetched_at > maxAgeMs) return null;
  return { uuid: row.uuid, fetchedAt: row.fetched_at, body: JSON.parse(row.body_json) as T };
}

/** Look up a cached document ignoring TTL. Used as a fallback when the HTTP
 *  fetch fails — we'd rather return a stale document than nothing. */
export function getCachedDocumentAllowStale<T>(uuid: string): CachedDocument<T> | null {
  const row = getPf2eDb().prepare('SELECT uuid, fetched_at, body_json FROM pf2e_compendium_docs WHERE uuid = ?').get(
    uuid,
  ) as Row | undefined;
  if (!row) return null;
  return { uuid: row.uuid, fetchedAt: row.fetched_at, body: JSON.parse(row.body_json) as T };
}

/** Persist a freshly-fetched document. Overwrites any existing row for the
 *  same uuid so the TTL clock resets on every successful fetch. */
export function putCachedDocument<T>(uuid: string, body: T): void {
  getPf2eDb()
    .prepare(
      `INSERT INTO pf2e_compendium_docs (uuid, fetched_at, body_json) VALUES (?, ?, ?)
       ON CONFLICT(uuid) DO UPDATE SET fetched_at = excluded.fetched_at, body_json = excluded.body_json`,
    )
    .run(uuid, Date.now(), JSON.stringify(body));
}

/** Drop a single document from the cache. Callers pair this with a retry
 *  when they've detected a server-side change to a known uuid. */
export function invalidateCachedDocument(uuid: string): void {
  getPf2eDb().prepare('DELETE FROM pf2e_compendium_docs WHERE uuid = ?').run(uuid);
}

/** Drop every cached document. Exposed for a future "clear cache" button
 *  and for tests. */
export function invalidateAllCachedDocuments(): void {
  getPf2eDb().exec('DELETE FROM pf2e_compendium_docs');
}
