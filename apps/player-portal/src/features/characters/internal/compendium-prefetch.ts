import { api } from '@/features/characters/api';
import type { CompendiumDocument } from '@/features/characters/types';
import { extractDetailBio } from './compendium-doc-fields';

const PREFETCH_CONCURRENCY = 4;

export interface PrefetchOptions {
  /** Cancellation token — workers bail when this returns true. Required because
   *  every consumer needs an unmount-safe way to abort in-flight fetches. */
  isCancelled: () => boolean;
  /** Fired on cache hits AND fresh fetches. Callers use it to advance their
   *  derived state (eval map, "loaded" set, version bump) without waiting for
   *  the queue to drain. */
  onDocHydrated?: (uuid: string, doc: CompendiumDocument) => void;
  /** Fired when a fetch fails. Default: silent (the doc is just skipped). */
  onError?: (uuid: string, err: unknown) => void;
  /** When provided, each fetched doc's prerequisite strings are looked up
   *  against the compendium and cached to known-uuid-or-null. Skipped when
   *  omitted — class features and other prereq-free items don't need this
   *  pass and would only waste API calls. */
  prereqCache?: Map<string, string | null>;
}

/**
 * Background-fills `docCache` for a list of compendium-targeted refs at bounded
 * concurrency. Generic over the input shape — only `uuid` is read — so the
 * same fetcher serves the picker (CompendiumMatch[]), the progression timeline
 * (ClassFeatureEntry[]), and any future caller that has a list of UUIDs.
 */
export async function prefetchDocuments(
  refs: readonly { uuid: string }[],
  docCache: Map<string, CompendiumDocument>,
  options: PrefetchOptions,
): Promise<void> {
  const { isCancelled, onDocHydrated, onError, prereqCache } = options;
  const queue = refs.filter((r) => !docCache.has(r.uuid));
  // Already-cached docs still need their hydration callback fired — the
  // caller's derived state is per-render, not persisted alongside the cache.
  if (onDocHydrated) {
    for (const ref of refs) {
      const cached = docCache.get(ref.uuid);
      if (cached) onDocHydrated(ref.uuid, cached);
    }
  }
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0 && !isCancelled()) {
      const ref = queue.shift();
      if (!ref) break;
      let doc = docCache.get(ref.uuid);
      if (!doc) {
        try {
          const result = await api.getCompendiumDocument(ref.uuid);
          if (isCancelled()) break;
          doc = result.document;
          docCache.set(ref.uuid, doc);
        } catch (err) {
          onError?.(ref.uuid, err);
          continue;
        }
      }
      onDocHydrated?.(ref.uuid, doc);
      if (prereqCache) await resolvePrereqsForDoc(doc, prereqCache, isCancelled);
    }
  });
  await Promise.all(workers);
}

async function resolvePrereqsForDoc(
  doc: CompendiumDocument,
  cache: Map<string, string | null>,
  isCancelled: () => boolean,
): Promise<void> {
  const bio = extractDetailBio(doc);
  const prereqs = bio.prerequisites ?? [];
  for (const text of prereqs) {
    if (isCancelled()) return;
    const key = text.toLowerCase();
    if (cache.has(key)) continue;
    try {
      const result = await api.searchCompendium({ q: text, documentType: 'Item', limit: 5 });
      if (isCancelled()) return;
      const exact = result.matches.find((m) => m.name.toLowerCase() === key);
      cache.set(key, exact?.uuid ?? null);
    } catch {
      cache.set(key, null);
    }
  }
}
