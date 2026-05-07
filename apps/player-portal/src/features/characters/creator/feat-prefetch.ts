import { api } from '@/features/characters/api';
import type { CompendiumDocument, CompendiumMatch } from '@/features/characters/types';
import { extractDetailBio } from './feat-bio';

const PREFETCH_CONCURRENCY = 4;

/**
 * Background-fills the document + prereq caches for a list of matches.
 * Workers run at bounded concurrency so the network doesn't stampede on
 * a fresh 50-item page.
 *
 * `onDocHydrated` fires after each doc fetch; callers use it to update
 * their prereq evaluation state without waiting for the full queue.
 * `isCancelled` lets the caller abort when the picker unmounts.
 */
export async function prefetchDocuments(
  matches: CompendiumMatch[],
  docCache: Map<string, CompendiumDocument>,
  prereqCache: Map<string, string | null>,
  onDocHydrated: ((uuid: string, doc: CompendiumDocument) => void) | undefined,
  isCancelled: () => boolean,
): Promise<void> {
  const queue = matches.filter((m) => !docCache.has(m.uuid));
  // Already-cached docs still need their evaluation surfaced — the
  // caller's evaluations map is per-render, not persisted.
  if (onDocHydrated) {
    for (const match of matches) {
      const cached = docCache.get(match.uuid);
      if (cached) onDocHydrated(match.uuid, cached);
    }
  }
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0 && !isCancelled()) {
      const match = queue.shift();
      if (!match) break;
      let doc = docCache.get(match.uuid);
      if (!doc) {
        try {
          const result = await api.getCompendiumDocument(match.uuid);
          if (isCancelled()) break;
          doc = result.document;
          docCache.set(match.uuid, doc);
        } catch {
          continue;
        }
      }
      onDocHydrated?.(match.uuid, doc);
      await resolvePrereqsForDoc(doc, prereqCache, isCancelled);
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
