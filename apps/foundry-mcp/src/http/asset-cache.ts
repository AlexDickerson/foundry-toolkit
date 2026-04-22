// In-memory LRU cache for proxied Foundry asset responses. Keyed by
// request path (e.g. `/systems/pf2e/icons/foo.webp`). Stores the decoded
// binary plus the contentType the module sent us so we can replay it on
// cache hits without going back over the WS bridge.
//
// Eviction is byte-capped — oldest entries are dropped until total bytes
// fit under the cap. Assets are small (portraits and icons, tens of KB
// each), maps intentionally go a different path, so the cap sets an
// upper bound on memory pressure rather than being a careful fit.
//
// Recency is tracked by re-inserting keys into a JS Map on read; Maps
// preserve insertion order so the first-iterated key is always the
// least-recently-used.

export interface AssetCacheEntry {
  contentType: string;
  body: Buffer;
  /** HTTP status — 200 for real assets, 404 for negative-cached dead paths. */
  status: number;
  /** Epoch ms when this entry expires, or null for "until evicted". */
  expiresAt: number | null;
}

export interface AssetCacheStats {
  entries: number;
  bytes: number;
  capBytes: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export class AssetCache {
  private readonly store = new Map<string, AssetCacheEntry>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly capBytes: number) {}

  /** Fetch and bump recency. Returns null on miss or expired negative cache. */
  get(key: string): AssetCacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      // Expired negative cache entry. Drop it and report miss.
      this.store.delete(key);
      this.bytes -= entry.body.length;
      this.misses++;
      return null;
    }
    // Re-insert to move to the MRU end.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry;
  }

  /** Store an entry, evicting LRU entries until the byte cap is satisfied. */
  set(key: string, entry: AssetCacheEntry): void {
    // Overwriting replaces the previous bytes in the accounting.
    const existing = this.store.get(key);
    if (existing) {
      this.bytes -= existing.body.length;
      this.store.delete(key);
    }

    // Oversized single entry — skip caching. We still want to serve it,
    // but it'd blow the cap on its own.
    if (entry.body.length > this.capBytes) return;

    this.store.set(key, entry);
    this.bytes += entry.body.length;

    while (this.bytes > this.capBytes) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.store.get(oldestKey);
      if (!oldest) break;
      this.store.delete(oldestKey);
      this.bytes -= oldest.body.length;
      this.evictions++;
    }
  }

  stats(): AssetCacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      bytes: this.bytes,
      capBytes: this.capBytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  /** Test / ops helper — drop everything. */
  clear(): void {
    this.store.clear();
    this.bytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}

// Default cap: ~128 MiB. Assets are tiny so this fits tens of thousands
// of entries in practice; the point of the cap is an upper bound, not a
// careful sizing. Overridable via env for ops.
const DEFAULT_CAP_BYTES = 134_217_728;

function parseCapBytes(): number {
  const raw = process.env.ASSET_CACHE_MAX_BYTES;
  if (!raw) return DEFAULT_CAP_BYTES;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CAP_BYTES;
  return n;
}

/** Singleton cache shared across route handlers. */
export const assetCache = new AssetCache(parseCapBytes());

/** Negative-cache TTL for 404s — short enough to recover after a fix,
 *  long enough to stop the bridge churning on dead paths. */
export const NEGATIVE_CACHE_TTL_MS = 60_000;
