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

import { getSetting, setSetting } from '@foundry-toolkit/db/pf2e';
import { resetFacetsIndex } from './facets-index.js';
import { createCompendiumApi, type CompendiumApi } from './index.js';
import { createPreparedCompendium, DEFAULT_MONSTER_PACK_IDS, type PreparedCompendium } from './prepared.js';

/** pf2e.db settings key for the Settings → Monsters pack override.
 *  Stored as `JSON.stringify(string[])`. Absent = use defaults. */
export const MONSTER_PACK_IDS_SETTING = 'compendiumMonsterPackIds';

let api: CompendiumApi | null = null;
let prepared: PreparedCompendium | null = null;

// Foundry-installed Actor pack ids, fetched once at init via
// `/api/compendium/packs?documentType=Actor`. Used to intersect the
// Settings-saved / default pack list against reality — callers never
// send a `packIds: [...]` with a pack Foundry doesn't actually have,
// which is what older bridges throw 404 on (fix in #45 but not every
// install runs the patched bridge). `null` = fetch hasn't resolved
// yet or failed; resolver passes the saved list through unchanged in
// that window, same as the pre-intersection behavior.
let availableActorPacks: Set<string> | null = null;
let availableActorPacksFetch: Promise<void> | null = null;

interface InitPreparedCompendiumOptions {
  /** foundry-mcp base URL, e.g. `http://server.ad:8765`. Trailing slash
   *  is tolerated; an empty string throws. */
  foundryMcpUrl: string;
  /** Override the 30-day TTL used by the underlying document cache. Rarely
   *  needed — exposed so tests can exercise the cache-expiry path. */
  documentTtlMs?: number;
}

/** Read the raw saved monster-pack list from pf2e.db settings, falling
 *  back to defaults when unset, malformed, or empty. Callers that send
 *  queries to the bridge should use `readMonsterPackIds()` instead —
 *  that one additionally intersects against the packs Foundry actually
 *  has installed so queries never include a missing pack. */
function readSavedOrDefaultMonsterPackIds(): readonly string[] {
  const raw = getSetting(MONSTER_PACK_IDS_SETTING);
  if (!raw) return DEFAULT_MONSTER_PACK_IDS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_MONSTER_PACK_IDS;
    const ids = parsed.filter((p): p is string => typeof p === 'string' && p.length > 0);
    // Treat an explicit empty array as "user cleared the list" — fall back
    // to defaults rather than return an empty search scope that would make
    // the Monster Browser silently empty.
    if (ids.length === 0) return DEFAULT_MONSTER_PACK_IDS;
    return ids;
  } catch {
    return DEFAULT_MONSTER_PACK_IDS;
  }
}

/** Return the saved monster-pack list intersected with the packs
 *  Foundry actually has installed. Two-stage fallback when the
 *  intersection is empty:
 *    1. Try defaults ∩ available — so a user who ticked only packs
 *       that have since been uninstalled still gets something.
 *    2. Fall through to the raw saved list. This lets the bridge
 *       either throw (old bridge) or skip missing packs (post-#45)
 *       — no worse than the pre-intersection behavior.
 *
 *  When the available-packs fetch hasn't resolved yet (or failed), we
 *  pass the saved list through unchanged — matches the pre-intersection
 *  behavior so this layer is purely additive.
 *
 *  Public so tests and IPC handlers can share one source of truth. */
export function readMonsterPackIds(): readonly string[] {
  const saved = readSavedOrDefaultMonsterPackIds();
  if (!availableActorPacks) return saved;

  const available = availableActorPacks;
  const intersected = saved.filter((id) => available.has(id));
  if (intersected.length > 0) return intersected;

  const defaultFallback = DEFAULT_MONSTER_PACK_IDS.filter((id) => available.has(id));
  if (defaultFallback.length > 0) return defaultFallback;

  // Last resort: neither saved nor defaults overlap with installed
  // packs. Warn once so it's obvious in the console, then pass the raw
  // saved list through to let the bridge decide (post-#45 bridge skips
  // missing packs cleanly; older bridge 404s).
  console.warn('[compendium] Monster pack selection has no overlap with installed packs.', {
    saved: [...saved],
    available: [...available],
  });
  return saved;
}

/** Persist a new monster-pack override and invalidate any memoized state
 *  that depends on the prior scope. Called from the Settings → Monsters
 *  IPC handler. */
export function writeMonsterPackIds(ids: readonly string[]): void {
  setSetting(MONSTER_PACK_IDS_SETTING, JSON.stringify(ids));
  resetFacetsIndex();
}

/** Fetch the list of installed Actor packs from foundry-mcp and cache
 *  it for the lifetime of the singleton. Failures are logged and the
 *  cache stays `null` — callers fall through to the raw saved list. */
export async function refreshAvailableActorPacks(): Promise<void> {
  if (!api) return;
  try {
    const { packs } = await api.listCompendiumPacks({ documentType: 'Actor' });
    availableActorPacks = new Set(packs.map((p) => p.id));
  } catch (e) {
    console.warn('[compendium] Could not list available Actor packs:', (e as Error).message);
    // Leave the cache as-is. If a prior refresh succeeded we keep those
    // results; if this was the first attempt the cache stays null and
    // the resolver passes through.
  }
}

/** Returns the cached available Actor packs set, or `null` if the
 *  fetch hasn't resolved yet. Exported for tests + any consumer that
 *  wants to render "unavailable" hints in the Settings UI. */
export function getAvailableActorPacks(): ReadonlySet<string> | null {
  return availableActorPacks;
}

/** Test/ops helper — drop the cached available-packs list. */
export function resetAvailableActorPacks(): void {
  availableActorPacks = null;
  availableActorPacksFetch = null;
}

/** Idempotent — calling twice with the same options is a no-op, which is
 *  what we want for Electron's `app.whenReady` + reload story. If the
 *  caller wants to swap URLs mid-session, call `resetPreparedCompendium`
 *  first.
 *
 *  Fires a background `refreshAvailableActorPacks()` so subsequent
 *  queries can intersect the saved pack list against reality. First
 *  few queries may fire before the fetch resolves — they pass the
 *  saved list through unchanged, matching the pre-intersection
 *  behavior. In practice the fetch resolves in ~50ms. */
export function initPreparedCompendium(opts: InitPreparedCompendiumOptions): void {
  if (prepared) return;
  if (!opts.foundryMcpUrl || opts.foundryMcpUrl.trim().length === 0) {
    throw new Error('initPreparedCompendium: foundryMcpUrl is required');
  }
  api = createCompendiumApi({
    baseUrl: opts.foundryMcpUrl,
    documentTtlMs: opts.documentTtlMs,
  });
  prepared = createPreparedCompendium(api, {
    resolveMonsterPackIds: readMonsterPackIds,
  });
  availableActorPacksFetch = refreshAvailableActorPacks();
  void availableActorPacksFetch;
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
  resetAvailableActorPacks();
}
