// Tiny helpers used by more than one domain module. Kept local to the pf2e
// subpackage rather than pulled from @foundry-toolkit/shared so the DB layer can't
// accidentally pick up UI-flavoured utilities.

import type { DatabaseSync } from 'node:sqlite';

/** Attempt to parse JSON, returning `fallback` on failure or null input. */
export function tryParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Run fn inside a SQLite transaction. Rolls back and re-throws on error.
 *  node:sqlite's DatabaseSync has no .transaction() shorthand; this fills the gap. */
export function transact(db: DatabaseSync, fn: () => void): void {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
