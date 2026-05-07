import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { computeHasMore, usePaginatedSearch, PICKER_PAGE_SIZE } from './usePaginatedSearch';

// ─── Pure helper tests ─────────────────────────────────────────────────────

describe('computeHasMore', () => {
  it('returns false when loaded equals total', () => {
    expect(computeHasMore(50, 50)).toBe(false);
  });

  it('returns false when loaded exceeds total (guard)', () => {
    expect(computeHasMore(50, 60)).toBe(false);
  });

  it('returns true when loaded is less than total', () => {
    expect(computeHasMore(100, 50)).toBe(true);
  });

  it('returns false when total is 0', () => {
    expect(computeHasMore(0, 0)).toBe(false);
  });

  it('returns true when loaded is 0 and total is positive', () => {
    expect(computeHasMore(1, 0)).toBe(true);
  });
});

describe('PICKER_PAGE_SIZE', () => {
  it('is 50', () => {
    expect(PICKER_PAGE_SIZE).toBe(50);
  });
});

// ─── Hook integration tests ────────────────────────────────────────────────

type Item = { id: number; name: string };

/** Build a fetcher that returns items from a fixed array, sliced by offset+pageSize. */
function makeItemFetcher(items: Item[]) {
  return vi.fn(async (offset: number, pageSize: number) => ({
    matches: items.slice(offset, offset + pageSize),
    total: items.length,
  }));
}

const ITEMS_75: Item[] = Array.from({ length: 75 }, (_, i) => ({ id: i, name: `Item ${i.toString()}` }));
const ITEMS_30: Item[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Item ${i.toString()}` }));

afterEach(() => {
  cleanup();
});

describe('usePaginatedSearch — initial load', () => {
  it('starts in loading state', () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    expect(result.current.state.kind).toBe('loading');
  });

  it('transitions to ready with first page items and total', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    const state = result.current.state;
    expect(state.kind).toBe('ready');
    if (state.kind !== 'ready') return;
    expect(state.items).toHaveLength(PICKER_PAGE_SIZE);
    expect(state.total).toBe(75);
  });

  it('hasMore is true when total > page size', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    expect(result.current.hasMore).toBe(true);
  });

  it('hasMore is false when all items fit on the first page', async () => {
    const fetcher = makeItemFetcher(ITEMS_30);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    expect(result.current.hasMore).toBe(false);
  });

  it('calls fetcher with offset=0 and the configured pageSize', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    renderHook(() => usePaginatedSearch(fetcher, [], { pageSize: 20 }));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledWith(0, 20);
  });

  it('calls fetcher with default page size when none specified', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledWith(0, PICKER_PAGE_SIZE);
  });
});

describe('usePaginatedSearch — load more', () => {
  it('appends next page items and updates total', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});

    await act(async () => {
      result.current.loadMore();
    });

    const state = result.current.state;
    expect(state.kind).toBe('ready');
    if (state.kind !== 'ready') return;
    expect(state.items).toHaveLength(75); // 50 + 25 remaining
    expect(state.total).toBe(75);
  });

  it('calls fetcher with correct offset for the second page', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});

    await act(async () => {
      result.current.loadMore();
    });

    expect(fetcher).toHaveBeenNthCalledWith(2, PICKER_PAGE_SIZE, PICKER_PAGE_SIZE);
  });

  it('hasMore becomes false after loading all items', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    await act(async () => {
      result.current.loadMore();
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('is a no-op when hasMore is false', async () => {
    const fetcher = makeItemFetcher(ITEMS_30);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      result.current.loadMore();
    });

    expect(fetcher).toHaveBeenCalledTimes(1); // only the initial page-0 fetch
  });
});

describe('usePaginatedSearch — dep change resets', () => {
  it('re-fetches from offset 0 and replaces items when deps change', async () => {
    let dep = 'a';
    const fetcherA = makeItemFetcher(ITEMS_75);
    const fetcherB = makeItemFetcher(ITEMS_30);

    const { result, rerender } = renderHook(() => {
      const fetcher = dep === 'a' ? fetcherA : fetcherB;
      return usePaginatedSearch(fetcher, [dep]);
    });

    await act(async () => {});
    const firstState = result.current.state;
    expect(firstState.kind).toBe('ready');
    if (firstState.kind === 'ready') {
      expect(firstState.total).toBe(75);
    }

    dep = 'b';
    rerender();
    await act(async () => {});

    const secondState = result.current.state;
    expect(secondState.kind).toBe('ready');
    if (secondState.kind === 'ready') {
      expect(secondState.total).toBe(30);
      expect(secondState.items).toHaveLength(30);
    }
    // fetcherB was called with offset=0
    expect(fetcherB).toHaveBeenCalledWith(0, PICKER_PAGE_SIZE);
  });

  it('resets hasMore on dep change', async () => {
    let dep = 'large';
    const largeFetcher = makeItemFetcher(ITEMS_75);
    const smallFetcher = makeItemFetcher(ITEMS_30);

    const { result, rerender } = renderHook(() => {
      const fetcher = dep === 'large' ? largeFetcher : smallFetcher;
      return usePaginatedSearch(fetcher, [dep]);
    });

    await act(async () => {});
    expect(result.current.hasMore).toBe(true);

    dep = 'small';
    rerender();
    await act(async () => {});
    expect(result.current.hasMore).toBe(false);
  });
});

describe('usePaginatedSearch — error handling', () => {
  it('transitions to error state when the fetcher throws', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network failure'));
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    await act(async () => {});
    expect(result.current.state.kind).toBe('error');
    if (result.current.state.kind === 'error') {
      expect(result.current.state.message).toBe('network failure');
    }
  });
});

describe('usePaginatedSearch — onPage callback', () => {
  it('calls onPage with first page items', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const onPage = vi.fn();
    renderHook(() => usePaginatedSearch(fetcher, [], { onPage }));
    await act(async () => {});
    expect(onPage).toHaveBeenCalledTimes(1);
    const [items] = onPage.mock.calls[0] as [Item[], unknown];
    expect(items).toHaveLength(PICKER_PAGE_SIZE);
  });

  it('calls onPage with only the NEW items on load more', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const onPage = vi.fn();
    const { result } = renderHook(() => usePaginatedSearch(fetcher, [], { onPage }));
    await act(async () => {});
    await act(async () => {
      result.current.loadMore();
    });
    expect(onPage).toHaveBeenCalledTimes(2);
    // Second call: only the 25 remaining items, not all 75
    const [secondPageItems] = onPage.mock.calls[1] as [Item[], unknown];
    expect(secondPageItems).toHaveLength(25);
  });
});

describe('usePaginatedSearch — isLoadingMore', () => {
  it('is false initially and while page-0 loads', async () => {
    const fetcher = makeItemFetcher(ITEMS_75);
    const { result } = renderHook(() => usePaginatedSearch(fetcher, []));
    expect(result.current.isLoadingMore).toBe(false);
    await act(async () => {});
    expect(result.current.isLoadingMore).toBe(false);
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('becomes true while a load-more fetch is pending', async () => {
    let resolve!: (v: { matches: Item[]; total: number }) => void;
    const slowFetcher = vi.fn(
      () =>
        new Promise<{ matches: Item[]; total: number }>((res) => {
          resolve = res;
        }),
    );

    const { result } = renderHook(() => usePaginatedSearch(slowFetcher, []));

    // Resolve the initial page-0 fetch.
    await act(async () => {
      resolve({ matches: ITEMS_75.slice(0, PICKER_PAGE_SIZE), total: 75 });
    });

    // Start load-more — fetcher has not resolved yet.
    let resolveMore!: (v: { matches: Item[]; total: number }) => void;
    slowFetcher.mockReturnValueOnce(
      new Promise<{ matches: Item[]; total: number }>((res) => {
        resolveMore = res;
      }),
    );

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.isLoadingMore).toBe(true);

    // Resolve load-more.
    await act(async () => {
      resolveMore({ matches: ITEMS_75.slice(PICKER_PAGE_SIZE), total: 75 });
    });
    expect(result.current.isLoadingMore).toBe(false);
  });
});
