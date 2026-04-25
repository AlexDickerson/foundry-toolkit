// Pure utility — no Electron, no I/O, no caching.
// Extracts URL rewriting so it stays testable outside the IPC handler.

/** Convert a Foundry-relative asset path (e.g. `systems/pf2e/icons/…` or
 *  `modules/pf2e-tokens-bestiaries/…`) to a URL the Electron renderer can load.
 *
 *  - When `mcpBaseUrl` is supplied the path is served through foundry-mcp's
 *    existing asset proxy (`GET /modules/*`, `/systems/*`, etc.) which fetches
 *    from the live Foundry instance over the bridge. This is the preferred path
 *    and works for any asset regardless of where the dm-tool database lives.
 *  - When `mcpBaseUrl` is absent (local-only install, no mcp configured) we
 *    fall back to the `monster-file://img/<path>` Electron protocol, which
 *    searches for the file relative to the pf2e.db directory.
 *
 *  Already-absolute URLs (http/https/monster-file://) are returned untouched.
 *  Returns `null` for missing/empty inputs. */
export function toMonsterFileUrl(path: string | null | undefined, mcpBaseUrl?: string): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('monster-file://')) return path;
  if (mcpBaseUrl) {
    const base = mcpBaseUrl.replace(/\/+$/, '');
    return `${base}/${path}`;
  }
  // Local-only fallback: monster-file:// protocol searches for the file
  // relative to the pf2e.db directory by progressively stripping path segments.
  const encoded = path.replace(/#/g, '%23').replace(/\?/g, '%3F');
  return `monster-file://img/${encoded}`;
}
