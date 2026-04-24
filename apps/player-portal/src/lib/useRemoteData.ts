import { useEffect, useRef, useState } from 'react';

/**
 * State of a single remote fetch driven by `useRemoteData`.
 *
 * Re-fetches (triggered by changing deps) intentionally do NOT reset to
 * `'loading'` — the previous `'ready'` data stays visible until the next
 * response lands. That avoids flashing an empty/loading state during
 * incremental narrowing (e.g. typing into a search box).
 */
export type RemoteDataState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string };

export interface UseRemoteDataOptions<T> {
  /** Optional side effect run on each successful fetch, after the
   *  hook's state has been set. Receives the resolved data plus an
   *  `isCancelled` probe so any background work it kicks off
   *  (e.g. document prefetches) can abort when the effect cleans up. */
  onSuccess?: (data: T, isCancelled: () => boolean) => void;
}

/**
 * Single-target async data hook. Calls `fetcher` on mount and whenever
 * any entry in `deps` changes. Cancellation flips on cleanup, so any
 * resolved-but-stale response is dropped before it can update state.
 *
 * The caller owns the deps array — the hook does not run an
 * exhaustive-deps check on `fetcher` (otherwise callers would have to
 * memoize an inline async closure on every render, which defeats the
 * point).
 */
export function useRemoteData<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options?: UseRemoteDataOptions<T>,
): RemoteDataState<T> {
  // Track latest options so the hook always calls the most recent
  // `onSuccess` without forcing the caller to memoize it.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<RemoteDataState<T>>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const isCancelled = (): boolean => cancelled;

    fetcher()
      .then((data) => {
        if (cancelled) return;
        setState({ kind: 'ready', data });
        optionsRef.current?.onSuccess?.(data, isCancelled);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
