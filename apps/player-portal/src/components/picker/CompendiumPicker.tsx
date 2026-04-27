import type { ReactNode } from 'react';

interface SplitPane {
  /** When true: list narrows to w-80 and detailSlot renders on the right */
  detailOpen: boolean;
  detailSlot: ReactNode;
}

interface CompendiumPickerProps<TItem> {
  /** Shows a "Searching…" message when true and items is empty */
  isLoading?: boolean;
  /** Shows an error message when non-null */
  error?: string | null;
  /** Visible items after all caller-side filtering/sorting */
  items: TItem[];
  /** Message shown when not loading, no error, and items is empty */
  emptyMessage?: string;
  /**
   * Renders the full list, including its container element.
   * Called only when items is non-empty.
   */
  renderList: (items: TItem[]) => ReactNode;
  /** data-testid on the scrollable list wrapper (split-pane mode only) */
  resultsTestId?: string;
  /** Load-more / append-style pagination */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Shown in the Load more button when hasMore is true */
  remainingCount?: number;
  loadMoreTestId?: string;
  /**
   * When provided, wraps content in a flex row.
   * The list area narrows when detailOpen; detailSlot renders alongside.
   */
  splitPane?: SplitPane;
}

export function CompendiumPicker<TItem>({
  isLoading = false,
  error,
  items,
  emptyMessage = 'No matches. Loosen the filters or search term.',
  renderList,
  resultsTestId,
  hasMore,
  isLoadingMore,
  onLoadMore,
  remainingCount,
  loadMoreTestId,
  splitPane,
}: CompendiumPickerProps<TItem>): React.ReactElement {
  const detailOpen = splitPane?.detailOpen ?? false;

  const listArea = (
    <div
      className={[
        'overflow-y-auto',
        splitPane ? (detailOpen ? 'w-80 shrink-0 border-r border-pf-border' : 'flex-1') : 'flex-1',
      ].join(' ')}
      data-testid={resultsTestId}
    >
      {isLoading && items.length === 0 && (
        <p className="p-4 text-sm italic text-pf-alt">Searching…</p>
      )}
      {error != null && (
        <p className="p-4 text-sm text-pf-primary">Search failed: {error}</p>
      )}
      {!isLoading && error == null && items.length === 0 && (
        <p className="p-4 text-sm italic text-pf-alt">{emptyMessage}</p>
      )}
      {items.length > 0 && (
        <>
          {renderList(items)}
          {(hasMore === true || isLoadingMore === true) && (
            <div className="border-t border-pf-border px-4 py-2 text-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                data-testid={loadMoreTestId}
                className="rounded border border-pf-border bg-pf-bg px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-alt-dark transition-colors hover:border-pf-primary hover:text-pf-primary disabled:cursor-wait disabled:opacity-50"
              >
                {isLoadingMore === true
                  ? 'Loading…'
                  : remainingCount != null
                    ? `Load more (${remainingCount.toString()} remaining)`
                    : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (!splitPane) {
    return listArea;
  }

  return (
    <div className="flex min-h-0 flex-1">
      {listArea}
      {detailOpen && splitPane.detailSlot}
    </div>
  );
}
