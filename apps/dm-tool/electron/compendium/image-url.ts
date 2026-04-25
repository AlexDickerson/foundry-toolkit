// Pure utility — no Electron, no I/O, no caching.
// Extracts URL rewriting so it stays testable outside the IPC handler.

/** Convert a Foundry-relative asset path (e.g. `systems/pf2e/icons/…`) to
 *  a `monster-file://img/<path>` URL that the Electron renderer can load
 *  via the registered protocol handler.
 *
 *  Returns `null` for missing/empty inputs. Leaves already-absolute URLs
 *  (http/https) or `monster-file://` URLs untouched so callers are
 *  idempotent. Encodes `#` and `?` to avoid confusing URL parsers. */
export function toMonsterFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('monster-file://')) return path;
  // Encode characters that URL parsers treat specially inside the path segment.
  const encoded = path.replace(/#/g, '%23').replace(/\?/g, '%3F');
  return `monster-file://img/${encoded}`;
}
