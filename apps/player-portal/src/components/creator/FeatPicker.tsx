import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import type { CompendiumDocument, CompendiumMatch, CompendiumSearchOptions, CompendiumSource } from '../../api/types';
import { useDebounce } from '../../lib/useDebounce';
import { type RemoteDataState, useRemoteData } from '../../lib/useRemoteData';
import { usePaginatedSearch } from '../../lib/usePaginatedSearch';
import { evaluateDocument } from '../../prereqs';
import type { CharacterContext, Evaluation } from '../../prereqs';
import { CompendiumPicker } from '../picker';
import { prefetchDocuments } from './feat-prefetch';
import { type SortMode, type SortState, FilterSummary, SourcePicker, SortToggle, UnmetToggle } from './FeatFilters';
import { FeatMatchList } from './FeatMatchRow';
import { FeatDetailPanel } from './FeatDetailPanel';
import { useFeatDetail } from './useFeatDetail';

interface Props {
  title: string;
  /** Pre-filters applied to every search. `packIds` scopes silently;
   *  the user-visible filter is by publication source. */
  filters: Pick<
    CompendiumSearchOptions,
    'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'maxLevel' | 'ancestrySlug'
  >;
  /** Character state for prereq evaluation. Optional — callers without
   *  a character context get the picker with evaluation skipped. */
  characterContext?: CharacterContext;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}

export function FeatPicker({ title, filters, characterContext, onPick, onClose }: Props): React.ReactElement {
  const [sort, setSort] = useState<SortState>({ mode: 'alpha', dir: 'asc' });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<Map<string, Evaluation>>(new Map());
  const [hideUnmet, setHideUnmet] = useState(true);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);
  const docCacheRef = useRef<Map<string, CompendiumDocument>>(new Map());
  const prereqCacheRef = useRef<Map<string, string | null>>(new Map());

  const { detailTarget, setDetailTarget, detail } = useFeatDetail(docCacheRef, characterContext, setEvaluations);

  // Stable filter key for the search effect dep array.
  const callerPackIdsKey = (filters.packIds ?? []).join('|');
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        sources: [...selectedSources].sort(),
        documentType: filters.documentType ?? null,
        traits: filters.traits ?? [],
        anyTraits: filters.anyTraits ?? [],
        maxLevel: filters.maxLevel ?? null,
        packIds: callerPackIdsKey,
        ancestrySlug: filters.ancestrySlug ?? null,
      }),
    [
      selectedSources,
      filters.documentType,
      filters.traits,
      filters.anyTraits,
      filters.maxLevel,
      callerPackIdsKey,
      filters.ancestrySlug,
    ],
  );

  const { state: matchesState, hasMore, isLoadingMore, loadMore } = usePaginatedSearch<CompendiumMatch>(
    async (offset, pageSize) => {
      const opts: CompendiumSearchOptions = { q: debouncedQuery, limit: pageSize, offset };
      if (filters.packIds !== undefined && filters.packIds.length > 0) opts.packIds = filters.packIds;
      if (selectedSources.length > 0) opts.sources = selectedSources;
      if (filters.documentType !== undefined) opts.documentType = filters.documentType;
      if (filters.traits !== undefined) opts.traits = filters.traits;
      if (filters.anyTraits !== undefined) opts.anyTraits = filters.anyTraits;
      if (filters.maxLevel !== undefined) opts.maxLevel = filters.maxLevel;
      if (filters.ancestrySlug !== undefined) opts.ancestrySlug = filters.ancestrySlug;
      return api.searchCompendium(opts);
    },
    [debouncedQuery, filterKey],
    {
      onPage: (newMatches, isCancelled) => {
        const ctx = characterContext;
        void prefetchDocuments(
          newMatches,
          docCacheRef.current,
          prereqCacheRef.current,
          ctx
            ? (uuid, doc) => {
                if (isCancelled()) return;
                const evaluation = evaluateDocument(doc, ctx);
                setEvaluations((prev) => {
                  if (prev.get(uuid) === evaluation) return prev;
                  const next = new Map(prev);
                  next.set(uuid, evaluation);
                  return next;
                });
              }
            : undefined,
          isCancelled,
        );
      },
    },
  );

  const traitsKey = (filters.traits ?? []).join('|');
  const sourcesState: RemoteDataState<CompendiumSource[]> = useRemoteData<CompendiumSource[]>(
    async () => {
      const opts: {
        documentType?: string;
        packIds?: string[];
        q?: string;
        traits?: string[];
        maxLevel?: number;
      } = {};
      if (filters.documentType !== undefined) opts.documentType = filters.documentType;
      if (filters.packIds !== undefined && filters.packIds.length > 0) opts.packIds = filters.packIds;
      if (debouncedQuery.length > 0) opts.q = debouncedQuery;
      if (filters.traits !== undefined && filters.traits.length > 0) opts.traits = filters.traits;
      if (filters.maxLevel !== undefined) opts.maxLevel = filters.maxLevel;
      const result = await api.listCompendiumSources(opts);
      return result.sources;
    },
    [filters.documentType, callerPackIdsKey, debouncedQuery, traitsKey, filters.maxLevel],
  );

  // Client-side sort + optional hide-unmet filter on top of server results.
  const visibleMatches = useMemo(() => {
    if (matchesState.kind !== 'ready') return [];
    const copy = [...matchesState.items];
    const dirMul = sort.dir === 'desc' ? -1 : 1;
    if (sort.mode === 'level') {
      const leveled = copy.filter((m) => m.level !== undefined);
      const unlevelled = copy.filter((m) => m.level === undefined);
      leveled.sort((a, b) => {
        const lvlCmp = ((a.level ?? 0) - (b.level ?? 0)) * dirMul;
        if (lvlCmp !== 0) return lvlCmp;
        return a.name.localeCompare(b.name);
      });
      unlevelled.sort((a, b) => a.name.localeCompare(b.name));
      return hideUnmet
        ? [...leveled, ...unlevelled].filter((m) => evaluations.get(m.uuid) !== 'fails')
        : [...leveled, ...unlevelled];
    }
    copy.sort((a, b) => a.name.localeCompare(b.name) * dirMul);
    return hideUnmet ? copy.filter((m) => evaluations.get(m.uuid) !== 'fails') : copy;
  }, [matchesState, sort, hideUnmet, evaluations]);

  const onSortClick = (mode: SortMode): void => {
    setSort((prev) =>
      prev.mode === mode ? { mode, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { mode, dir: 'asc' },
    );
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = previous;
    };
  }, []);

  const detailOpen = detailTarget !== null;

  // Portal to document.body so the modal escapes any ancestor's
  // child-selector utilities (e.g. Progression.tsx's `*:bg-pf-bg-dark
  // *:rounded-lg *:border *:p-4` section, which would otherwise paint
  // the backdrop solid and box-style the dialog).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="feat-picker"
      className="fixed inset-0 z-50 flex items-start justify-center bg-pf-text/50 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        data-detail-open={detailOpen}
        className={[
          'flex max-h-[80vh] w-full flex-col rounded border border-pf-border bg-pf-bg shadow-xl',
          'transition-[max-width] duration-200 ease-out',
          detailOpen ? 'max-w-4xl' : 'max-w-xl',
        ].join(' ')}
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between border-b border-pf-border px-4 py-2">
          <h2 className="font-serif text-lg font-semibold text-pf-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
          >
            ×
          </button>
        </header>

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
            data-testid="feat-picker-input"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SourcePicker sources={sourcesState} selected={selectedSources} onChange={setSelectedSources} />
              <UnmetToggle hide={hideUnmet} onChange={setHideUnmet} />
              <FilterSummary filters={filters} />
            </div>
            <SortToggle sort={sort} onChange={onSortClick} />
          </div>
        </div>

        <CompendiumPicker
          isLoading={matchesState.kind === 'loading'}
          error={matchesState.kind === 'error' ? matchesState.message : null}
          items={visibleMatches}
          renderList={(matches) => (
            <FeatMatchList
              matches={matches}
              evaluations={evaluations}
              activeUuid={detailTarget?.uuid}
              onSelect={setDetailTarget}
            />
          )}
          resultsTestId="feat-picker-results"
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          {...(matchesState.kind === 'ready'
            ? { remainingCount: matchesState.total - matchesState.items.length }
            : {})}
          loadMoreTestId="feat-picker-load-more"
          splitPane={{
            detailOpen,
            detailSlot: (
              <FeatDetailPanel
                target={detailTarget}
                detail={detail}
                prereqCache={prereqCacheRef}
                onPick={(): void => {
                  if (detailTarget) onPick(detailTarget);
                }}
                onClose={(): void => {
                  setDetailTarget(null);
                }}
              />
            ),
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
