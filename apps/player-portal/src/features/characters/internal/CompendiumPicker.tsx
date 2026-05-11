import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/features/characters/api';
import type { CompendiumMatch, CompendiumSearchOptions } from '@/features/characters/types';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { usePaginatedSearch } from '@/features/characters/internal/hooks/usePaginatedSearch';
import type { CompendiumDocument } from '@/features/characters/types';
import type { Evaluation } from '@/features/characters/internal/prereqs';
import { CompendiumDetailPanel } from './CompendiumDetailPanel';
import { PickerDialog } from '@/shared/ui/PickerDialog';

// Selected-row background. Tints by rarity so the highlight visually
// echoes the rarity pills in the filter row above — clicking the
// "Uncommon" pill and then selecting an item makes the row's highlight
// amber, etc. Common items (and rows without a rarity field — uncached
// search results) use the same neutral gray the Common rarity pill
// uses, so the four rarity tiers each read with a distinct colour.
function activeRowClass(rarity: string | undefined): string {
  switch (rarity?.toLowerCase()) {
    case 'uncommon':
      return 'bg-amber-100/60';
    case 'rare':
      return 'bg-blue-100/60';
    case 'unique':
      return 'bg-purple-100/60';
    default:
      return 'bg-pf-bg-dark';
  }
}

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
  /** Tailwind width class applied to the list column when a detail
   *  panel is open beside it. Defaults to `w-80` (320px) — feat/spell
   *  rows benefit from the room, but short-name targets like classes
   *  can be tightened to `w-56` so the detail column gets the space. */
  listOpenWidthClass?: string;
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
  listOpenWidthClass = 'w-80',
}: PickerResultListProps<TItem>): React.ReactElement {
  const detailOpen = splitPane?.detailOpen ?? false;

  const listArea = (
    <div
      className={[
        'overflow-y-auto',
        splitPane ? (detailOpen ? `${listOpenWidthClass} shrink-0 border-r border-pf-border` : 'flex-1') : 'flex-1',
      ].join(' ')}
      data-testid={resultsTestId}
    >
      {isLoading && items.length === 0 && <p className="p-4 text-sm italic text-pf-alt">Searching…</p>}
      {error != null && <p className="p-4 text-sm text-pf-primary">Search failed: {error}</p>}
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
  /** OR-filter on `system.traits.rarity` (drives the rarity picker). */
  rarities?: string[] | undefined;
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
  /** Optional prereq evaluation map. When provided, the default row shows
   *  a prereq-status badge and the detail panel tints unmet prereqs. */
  evaluations?: Map<string, Evaluation> | undefined;
  /** Optional warm doc cache (e.g. populated by the character creator's
   *  background prefetch). Hits short-circuit the detail panel's fetch. */
  docCache?: Map<string, CompendiumDocument> | undefined;
  /** Extra controls rendered below the search input (source picker, sort, etc.) */
  filterControls?: ReactNode | undefined;
  splitPane?: CompendiumPickerSplitPane | undefined;
  emptyMessage?: string | undefined;
  /** Shown instead of emptyMessage when filterItem removes all server results. */
  allFilteredMessage?: string | undefined;
  /** Forwarded to the internal CompendiumDetailPanel when the default
   *  click-row → split-pane flow is in use. Hides the panel's header
   *  (image + name + meta + traits) so it doesn't duplicate the picker
   *  dialog's own title bar. Has no effect when the caller provides
   *  their own `splitPane`. */
  detailHideHeader?: boolean | undefined;
  /** Tailwind width class for the list column when a detail panel is
   *  open beside it. See PickerResultListProps for the rationale. */
  listOpenWidthClass?: string | undefined;
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
  rarities,
  ancestrySlug,
  filterItem,
  sortItems,
  onPage,
  onQueryChange,
  evaluations,
  docCache,
  renderList,
  filterControls,
  splitPane,
  emptyMessage = 'No matches.',
  allFilteredMessage,
  detailHideHeader,
  listOpenWidthClass,
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
        rarities: [...(rarities ?? [])].sort(),
        ancestrySlug: ancestrySlug ?? null,
      }),
    [packIds, documentType, traits, anyTraits, maxLevel, sources, rarities, ancestrySlug],
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
      if (rarities?.length) opts.rarities = [...rarities];
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
    allFilteredMessage != null && allItems.length > 0 && visible.length === 0 ? allFilteredMessage : emptyMessage;

  // Internal detail flow: when the caller doesn't provide a custom splitPane
  // or renderList, clicking a row opens a built-in CompendiumDetailPanel
  // (description, traits, Pick button). Callers that need a custom detail
  // panel — e.g. character-creator picks with prereq breakdown — provide
  // their own splitPane and renderList instead.
  const [internalDetailTarget, setInternalDetailTarget] = useState<CompendiumMatch | null>(null);
  const useInternalDetail = splitPane === undefined && renderList === undefined;

  const defaultRenderList = useCallback(
    (items: CompendiumMatch[]): ReactNode => (
      <ul className="divide-y divide-pf-border">
        {items.map((m) => {
          const active = useInternalDetail && internalDetailTarget?.uuid === m.uuid;
          const evaluation = evaluations?.get(m.uuid);
          const fails = evaluation === 'fails';
          const unknown = evaluation === 'unknown';
          const traitsSummary = m.traits && m.traits.length > 0 ? m.traits.slice(0, 5).join(', ') : '';
          const rowTitle = fails
            ? "Character doesn't meet this entry's prerequisites"
            : unknown
              ? "Prereqs couldn't be auto-checked — verify manually before picking"
              : undefined;
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
                aria-pressed={active}
                title={rowTitle}
                className={[
                  'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                  active ? activeRowClass(m.rarity) : 'hover:bg-pf-tertiary/20',
                  fails ? 'opacity-60' : '',
                ].join(' ')}
                data-pick-uuid={m.uuid}
                data-match-uuid={m.uuid}
                data-prereq-state={evaluation ?? 'pending'}
              >
                {m.img && (
                  <img src={m.img} alt="" className="h-8 w-8 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-sm font-medium text-pf-text">{m.name}</span>
                      {unknown && (
                        <span
                          aria-label="Prereqs unchecked"
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500 bg-amber-100 text-[10px] font-semibold text-amber-800"
                        >
                          !
                        </span>
                      )}
                    </span>
                    {typeof m.level === 'number' && (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
                        L{m.level}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[10px] text-pf-alt">
                    <span className="truncate">{m.packLabel}</span>
                    {traitsSummary && <span className="truncate">{traitsSummary}</span>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    ),
    [onPick, useInternalDetail, internalDetailTarget, evaluations],
  );

  // When the caller didn't supply splitPane and we're in internal-detail mode,
  // render a built-in CompendiumDetailPanel beside the list.
  const internalDetailUuid = internalDetailTarget?.uuid;
  const internalDetailEvaluation = internalDetailUuid !== undefined ? evaluations?.get(internalDetailUuid) : undefined;
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
              {...(internalDetailEvaluation !== undefined ? { evaluation: internalDetailEvaluation } : {})}
              {...(docCache !== undefined ? { docCache } : {})}
              {...(testId !== undefined ? { testIdPrefix: testId } : {})}
              {...(detailHideHeader === true ? { hideHeader: true } : {})}
            />
          ) : null,
      }
    : splitPane;

  const detailOpen = effectiveSplitPane?.detailOpen ?? false;

  return (
    <PickerDialog
      title={title}
      onClose={onClose}
      maxWidthClass={detailOpen ? 'max-w-6xl' : 'max-w-xl'}
      animateMaxWidth
      testId={testId}
    >
      <div className="flex items-center gap-2 border-b border-pf-border px-4 py-2">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e): void => {
            setQuery(e.target.value);
          }}
          placeholder="Type to filter…"
          className="min-w-0 flex-1 rounded border border-pf-border bg-pf-bg px-2 py-1 text-sm text-pf-text placeholder:text-pf-alt focus:border-pf-primary focus:outline-none"
          data-testid={`${testId}-input`}
        />
        {filterControls}
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
        {...(state.kind === 'ready' ? { remainingCount: state.total - state.items.length } : {})}
        loadMoreTestId={loadMoreTestId}
        splitPane={effectiveSplitPane}
        {...(listOpenWidthClass !== undefined ? { listOpenWidthClass } : {})}
      />
    </PickerDialog>
  );
}
