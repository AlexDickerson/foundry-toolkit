import { useCallback, useEffect, useRef, useState } from 'react';

/** Default page size for compendium pickers. Bounded at 50 so the
 *  background document prefetch (FeatPicker) doesn't stampede the server
 *  on a fresh query. */
export const PICKER_PAGE_SIZE = 50;

// ─── Pure helpers ─────────────────────────────────────────────────────────

/** Returns `true` when there are server-side results beyond what has been
 *  loaded so far.  Used by pickers to decide whether to render the
 *  "Load more" button. */
export function computeHasMore(total: number, loadedCount: number): boolean {
  return loadedCount < total;
}

// ─── Types ────────────────────────────────────────────────────────────────

export type PaginatedState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; items: T[]; total: number }
  | { kind: 'error'; message: string };

export interface UsePaginatedSearchOptions<T> {
  pageSize?: number;
  /** Called after each successful page fetch with only the NEW items for
   *  that page. Use for background work like document prefetch.
   *  `isCancelled` returns true when the calling picker has been unmounted
   *  or its filters have changed, so background tasks can abort early. */
  onPage?: (newItems: T[], isCancelled: () => boolean) => void;
}

export interface UsePaginatedSearchResult<T> {
  state: PaginatedState<T>;
  /** True when server has items beyond those already accumulated. */
  hasMore: boolean;
  /** True while a load-more fetch is in flight. */
  isLoadingMore: boolean;
  /** Fetch the next page and append its results to `state.items`. No-op
   *  when already loading, in an error state, or `hasMore` is false. */
  loadMore: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

/**
 * Paginates over a compendium search.
 *
 * Page 0 loads automatically whenever `deps` change (same semantics as
 * `useRemoteData` — previous results stay visible until the first page
 * of the new query lands, so there is no blank flash during filter
 * transitions).  Subsequent pages load on demand via `loadMore()`.
 *
 * @param fetcher  Async function that accepts `(offset, pageSize)` and
 *                 returns `{ matches, total }`.  Must be stable or accept
 *                 the usual deps-driven re-creation cadence.
 * @param deps     Re-runs the page-0 fetch when any entry changes.
 * @param options  Optional `pageSize` override and `onPage` side-effect.
 */
export function usePaginatedSearch<T>(
  fetcher: (offset: number, pageSize: number) => Promise<{ matches: T[]; total: number }>,
  deps: ReadonlyArray<unknown>,
  options?: UsePaginatedSearchOptions<T>,
): UsePaginatedSearchResult<T> {
  const pageSize = options?.pageSize ?? PICKER_PAGE_SIZE;

  // Generation counter — increments on every dep change so any in-flight
  // response from a superseded query is silently dropped.
  const genRef = useRef(0);
  // Accumulated items for the current generation.
  const accRef = useRef<T[]>([]);
  // Keep options current without restarting effects.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<PaginatedState<T>>({ kind: 'loading' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // ── Page-0 effect ──────────────────────────────────────────────────────
  // Runs on every dep change.  Previous `ready` state is preserved until
  // the new page arrives so the UI doesn't flash empty during re-queries.
  useEffect(() => {
    const gen = ++genRef.current;
    // Reset accumulator for the new generation but leave the current
    // visible state unchanged so the old results stay on screen.
    accRef.current = [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingMore(false);

    let cancelled = false;
    const isCancelled = (): boolean => cancelled || gen !== genRef.current;

    fetcher(0, pageSize)
      .then(({ matches, total }) => {
        if (isCancelled()) return;
        accRef.current = matches;
        setState({ kind: 'ready', items: matches, total });
        optionsRef.current?.onPage?.(matches, isCancelled);
      })
      .catch((err: unknown) => {
        if (isCancelled()) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ── loadMore ──────────────────────────────────────────────────────────
  const loadMore = useCallback((): void => {
    if (isLoadingMore || state.kind !== 'ready') return;
    if (!computeHasMore(state.total, accRef.current.length)) return;

    const gen = genRef.current;
    const offset = accRef.current.length;

    setIsLoadingMore(true);
    fetcher(offset, pageSize)
      .then(({ matches, total }) => {
        if (gen !== genRef.current) return; // dep change arrived mid-flight
        const next = [...accRef.current, ...matches];
        accRef.current = next;
        setState({ kind: 'ready', items: next, total });
        optionsRef.current?.onPage?.(matches, () => gen !== genRef.current);
        setIsLoadingMore(false);
      })
      .catch((err: unknown) => {
        if (gen !== genRef.current) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        setIsLoadingMore(false);
      });
    // `state` is in deps so `loadMore` sees the current total; `isLoadingMore`
    // prevents concurrent requests.
  }, [isLoadingMore, state, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // `state.items.length` mirrors `accRef.current.length` at all times —
  // both are updated together in each page callback. Using the state
  // field here avoids reading the ref during render.
  const hasMore = state.kind === 'ready' ? computeHasMore(state.total, state.items.length) : false;

  return { state, hasMore, isLoadingMore, loadMore };
}
