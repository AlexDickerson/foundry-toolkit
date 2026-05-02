import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../api/client';
import type { CompendiumMatch, CompendiumSearchOptions } from '../../api/types';
import { useDebounce } from '../../lib/useDebounce';
import { usePaginatedSearch } from '../../lib/usePaginatedSearch';
import { CompendiumDetailPanel } from './CompendiumDetailPanel';
import { PickerDialog } from './PickerDialog';

// ─── Internal list + states area ──────────────────────────────────────────────

interface SplitPane {
  detailOpen: boolean;
  detailSlot: ReactNode;
}

export interface PickerResultListProps<TItem> {
  isLoading?: boolean;
  error?: string | null;
  items: TItem[];
  emptyMessage?: string;
  renderList: (items: TItem[]) => ReactNode;
  resultsTestId?: string | undefined;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  remainingCount?: number;
  loadMoreTestId?: string | undefined;
  splitPane?: SplitPane | undefined;
}

export function PickerResultList<TItem>({
  isLoading = false,
  error,
  items,
  emptyMessage = 'No matches.',
  renderList,
  resultsTestId,
  hasMore,
  isLoadingMore,
  onLoadMore,
  remainingCount,
  loadMoreTestId,
  splitPane,
}: PickerResultListProps<TItem>): React.ReactElement {
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

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CompendiumPickerSplitPane {
  detailOpen: boolean;
  detailSlot: ReactNode;
}

export interface CompendiumPickerProps {
  title: string;
  packIds?: string[] | undefined;
  documentType?: string | undefined;
  /** AND-filter: all listed traits must be present on the item. */
  traits?: string[] | undefined;
  /** OR-filter: item qualifies if it has any of these traits. */
  anyTraits?: string[] | undefined;
  maxLevel?: number | undefined;
  /** OR-filter on publication source title (drives the source-book picker). */
  sources?: string[] | undefined;
  ancestrySlug?: string | undefined;
  /** Client-side predicate applied after server results land. */
  filterItem?: ((match: CompendiumMatch) => boolean) | undefined;
  /** Client-side sort applied after filterItem. Receives a copy — safe to sort in-place. */
  sortItems?: ((items: CompendiumMatch[]) => CompendiumMatch[]) | undefined;
  /** Called with each page of new results. Use for background prefetch / side effects. */
  onPage?: ((items: CompendiumMatch[], isCancelled: () => boolean) => void) | undefined;
  /** Called with the debounced query each time it changes. */
  onQueryChange?: ((q: string) => void) | undefined;
  /**
   * Renders the full result list including its container element.
   * When omitted, a default row (img + name + Lv badge) calling onPick is used.
   */
  renderList?: ((items: CompendiumMatch[]) => ReactNode) | undefined;
  /** Extra controls rendered below the search input (source picker, sort, etc.) */
  filterControls?: ReactNode | undefined;
  splitPane?: CompendiumPickerSplitPane | undefined;
  emptyMessage?: string | undefined;
  /** Shown instead of emptyMessage when filterItem removes all server results. */
  allFilteredMessage?: string | undefined;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
  testId?: string | undefined;
  resultsTestId?: string | undefined;
  loadMoreTestId?: string | undefined;
}

export function CompendiumPicker({
  title,
  packIds,
  documentType,
  traits,
  anyTraits,
  maxLevel,
  sources,
  ancestrySlug,
  filterItem,
  sortItems,
  onPage,
  onQueryChange,
  renderList,
  filterControls,
  splitPane,
  emptyMessage = 'No matches.',
  allFilteredMessage,
  onPick,
  onClose,
  testId = 'compendium-picker',
  resultsTestId,
  loadMoreTestId,
}: CompendiumPickerProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stable value-based key so searches re-fire when filter content changes
  // without being sensitive to array identity churn from the caller.
  const searchKey = useMemo(
    () =>
      JSON.stringify({
        packIds: [...(packIds ?? [])].sort(),
        documentType: documentType ?? null,
        traits: [...(traits ?? [])].sort(),
        anyTraits: [...(anyTraits ?? [])].sort(),
        maxLevel: maxLevel ?? null,
        sources: [...(sources ?? [])].sort(),
        ancestrySlug: ancestrySlug ?? null,
      }),
    [packIds, documentType, traits, anyTraits, maxLevel, sources, ancestrySlug],  
  );

  const { state, hasMore, isLoadingMore, loadMore } = usePaginatedSearch<CompendiumMatch>(
    async (offset, pageSize) => {
      const opts: CompendiumSearchOptions = { q: debouncedQuery, limit: pageSize, offset };
      if (packIds?.length) opts.packIds = [...packIds];
      if (documentType) opts.documentType = documentType;
      if (traits?.length) opts.traits = [...traits];
      if (anyTraits?.length) opts.anyTraits = [...anyTraits];
      if (maxLevel != null) opts.maxLevel = maxLevel;
      if (sources?.length) opts.sources = [...sources];
      if (ancestrySlug) opts.ancestrySlug = ancestrySlug;
      return api.searchCompendium(opts);
    },
    [debouncedQuery, searchKey],
    onPage !== undefined ? { onPage } : undefined,
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    onQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onQueryChange]);

  const allItems = state.kind === 'ready' ? state.items : [];

  const visible = useMemo(() => {
    let items = filterItem ? allItems.filter(filterItem) : allItems;
    if (sortItems) items = sortItems([...items]);
    return items;
  }, [allItems, filterItem, sortItems]);

  const effectiveEmptyMessage =
    allFilteredMessage != null && allItems.length > 0 && visible.length === 0
      ? allFilteredMessage
      : emptyMessage;

  // Internal detail flow: when the caller doesn't provide a custom splitPane
  // or renderList, clicking a row opens a built-in detail panel that
  // mirrors the FeatPicker UX (description, traits, Pick button).
  const [internalDetailTarget, setInternalDetailTarget] = useState<CompendiumMatch | null>(null);
  const useInternalDetail = splitPane === undefined && renderList === undefined;

  const defaultRenderList = useCallback(
    (items: CompendiumMatch[]): ReactNode => (
      <ul className="grid grid-cols-1 gap-1 p-2">
        {items.map((m) => {
          const active = useInternalDetail && internalDetailTarget?.uuid === m.uuid;
          return (
            <li key={m.uuid}>
              <button
                type="button"
                onClick={(): void => {
                  if (useInternalDetail) {
                    setInternalDetailTarget(m);
                  } else {
                    onPick(m);
                  }
                }}
                className={[
                  'flex w-full items-center gap-2 rounded border px-2 py-1 text-left',
                  active
                    ? 'border-pf-primary bg-pf-bg-dark/40'
                    : 'border-transparent hover:border-pf-primary/60 hover:bg-pf-bg-dark/40',
                ].join(' ')}
                data-pick-uuid={m.uuid}
                data-match-uuid={m.uuid}
              >
                <img
                  src={m.img}
                  alt=""
                  className="h-6 w-6 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-pf-text">{m.name}</span>
                {typeof m.level === 'number' && (
                  <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
                    Lv {m.level}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    ),
    [onPick, useInternalDetail, internalDetailTarget],
  );

  // When the caller didn't supply splitPane and we're in internal-detail mode,
  // render a built-in CompendiumDetailPanel beside the list.
  const effectiveSplitPane: CompendiumPickerSplitPane | undefined = useInternalDetail
    ? {
        detailOpen: internalDetailTarget !== null,
        detailSlot:
          internalDetailTarget !== null ? (
            <CompendiumDetailPanel
              target={internalDetailTarget}
              onPick={(): void => {
                onPick(internalDetailTarget);
                setInternalDetailTarget(null);
              }}
              onClose={(): void => {
                setInternalDetailTarget(null);
              }}
              testIdPrefix={testId}
            />
          ) : null,
      }
    : splitPane;

  const detailOpen = effectiveSplitPane?.detailOpen ?? false;

  return (
    <PickerDialog
      title={title}
      onClose={onClose}
      maxWidthClass={detailOpen ? 'max-w-4xl' : 'max-w-xl'}
      animateMaxWidth
      testId={testId}
    >
      <div className="border-b border-pf-border px-4 py-2">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e): void => {
              setQuery(e.target.value);
            }}
            placeholder="Type to filter…"
            className="w-full rounded border border-pf-border bg-pf-bg px-2 py-1 text-sm text-pf-text placeholder:text-pf-alt focus:border-pf-primary focus:outline-none"
            data-testid={`${testId}-input`}
          />
          {filterControls != null && <div className="mt-1">{filterControls}</div>}
        </div>
        <PickerResultList
          isLoading={state.kind === 'loading'}
          error={state.kind === 'error' ? state.message : null}
          items={visible}
          emptyMessage={effectiveEmptyMessage}
          renderList={renderList ?? defaultRenderList}
          resultsTestId={resultsTestId}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          {...(state.kind === 'ready'
            ? { remainingCount: state.total - state.items.length }
            : {})}
          loadMoreTestId={loadMoreTestId}
          splitPane={effectiveSplitPane}
        />
    </PickerDialog>
  );
}
