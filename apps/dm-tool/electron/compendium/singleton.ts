// Process-wide singleton for the prepared-compendium facade. Mirrors the
// `openPf2eDb()` / `getPf2eDb()` pattern in `packages/db/src/pf2e/
// connection.ts` — callers initialise once at startup, every consumer
// site pulls the same instance via `getPreparedCompendium()`.
//
// This exists so the upcoming consumer-site migrations don't need to
// plumb `CompendiumApi` through every IPC handler; they can swap a
// `getPf2eDb()`-backed call to a `getPreparedCompendium()`-backed call
// with zero wiring churn.
//
// The singleton is optional at the app level: when `foundryMcpUrl` is
// empty, `initPreparedCompendium` is simply never called, and consumers
// that do reach it see a clear "not initialised" error. That lets the
// rest of the app (maps, books, chat without rules, etc.) keep working
// against a local-only configuration.

import { createCompendiumApi, type CompendiumApi } from './index.js';
import { createPreparedCompendium, type PreparedCompendium } from './prepared.js';

let api: CompendiumApi | null = null;
let prepared: PreparedCompendium | null = null;

export interface InitPreparedCompendiumOptions {
  /** foundry-mcp base URL, e.g. `http://server.ad:8765`. Trailing slash
   *  is tolerated; an empty string throws. */
  foundryMcpUrl: string;
  /** Override the 30-day TTL used by the underlying document cache. Rarely
   *  needed — exposed so tests can exercise the cache-expiry path. */
  documentTtlMs?: number;
}

/** Idempotent — calling twice with the same options is a no-op, which is
 *  what we want for Electron's `app.whenReady` + reload story. If the
 *  caller wants to swap URLs mid-session, call `resetPreparedCompendium`
 *  first. */
export function initPreparedCompendium(opts: InitPreparedCompendiumOptions): void {
  if (prepared) return;
  if (!opts.foundryMcpUrl || opts.foundryMcpUrl.trim().length === 0) {
    throw new Error('initPreparedCompendium: foundryMcpUrl is required');
  }
  api = createCompendiumApi({
    baseUrl: opts.foundryMcpUrl,
    documentTtlMs: opts.documentTtlMs,
  });
  prepared = createPreparedCompendium(api);
}

export function getPreparedCompendium(): PreparedCompendium {
  if (!prepared) {
    throw new Error('PreparedCompendium not initialized — call initPreparedCompendium() after loading config');
  }
  return prepared;
}

/** Also returns the underlying `CompendiumApi`. Useful for consumers that
 *  want to mix prepared-shape reads (via `getPreparedCompendium()`) with
 *  raw wire reads (e.g. to call `listCompendiumPacks`). */
export function getCompendiumApi(): CompendiumApi {
  if (!api) {
    throw new Error('CompendiumApi not initialized — call initPreparedCompendium() after loading config');
  }
  return api;
}

export function isPreparedCompendiumInitialized(): boolean {
  return prepared !== null;
}

/** Drop the singleton. Exposed for tests and for a future "reload config"
 *  UI action. */
export function resetPreparedCompendium(): void {
  api = null;
  prepared = null;
}
