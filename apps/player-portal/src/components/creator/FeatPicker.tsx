import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { CompendiumDocument, CompendiumMatch, CompendiumSearchOptions, CompendiumSource } from '../../api/types';
import { type RemoteDataState, useRemoteData } from '../../lib/useRemoteData';
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
  filters: Pick<
    CompendiumSearchOptions,
    'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'maxLevel' | 'ancestrySlug'
  >;
  characterContext?: CharacterContext;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}

export function FeatPicker({ title, filters, characterContext, onPick, onClose }: Props): React.ReactElement {
  const [sort, setSort] = useState<SortState>({ mode: 'alpha', dir: 'asc' });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<Map<string, Evaluation>>(new Map());
  const [hideUnmet, setHideUnmet] = useState(true);
  const [currentQuery, setCurrentQuery] = useState('');
  const docCacheRef = useRef<Map<string, CompendiumDocument>>(new Map());
  const prereqCacheRef = useRef<Map<string, string | null>>(new Map());

  const { detailTarget, setDetailTarget, detail } = useFeatDetail(docCacheRef, characterContext, setEvaluations);

  const callerPackIdsKey = (filters.packIds ?? []).join('|');
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
      if (currentQuery.length > 0) opts.q = currentQuery;
      if (filters.traits !== undefined && filters.traits.length > 0) opts.traits = filters.traits;
      if (filters.maxLevel !== undefined) opts.maxLevel = filters.maxLevel;
      const result = await api.listCompendiumSources(opts);
      return result.sources;
    },
    [filters.documentType, callerPackIdsKey, currentQuery, traitsKey, filters.maxLevel],
  );

  const onSortClick = (mode: SortMode): void => {
    setSort((prev) =>
      prev.mode === mode ? { mode, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { mode, dir: 'asc' },
    );
  };

  const onPage = useCallback(
    (newMatches: CompendiumMatch[], isCancelled: () => boolean): void => {
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
    [characterContext],
  );

  const filterItem = useCallback(
    (m: CompendiumMatch): boolean => {
      if (!hideUnmet) return true;
      return evaluations.get(m.uuid) !== 'fails';
    },
    [hideUnmet, evaluations],
  );

  const sortItems = useCallback(
    (items: CompendiumMatch[]): CompendiumMatch[] => {
      const dirMul = sort.dir === 'desc' ? -1 : 1;
      if (sort.mode === 'level') {
        const leveled = items.filter((m) => m.level !== undefined);
        const unlevelled = items.filter((m) => m.level === undefined);
        leveled.sort((a, b) => {
          const lvlCmp = ((a.level ?? 0) - (b.level ?? 0)) * dirMul;
          if (lvlCmp !== 0) return lvlCmp;
          return a.name.localeCompare(b.name);
        });
        unlevelled.sort((a, b) => a.name.localeCompare(b.name));
        return [...leveled, ...unlevelled];
      }
      return [...items].sort((a, b) => a.name.localeCompare(b.name) * dirMul);
    },
    [sort],
  );

  const detailOpen = detailTarget !== null;

  // Stable key for sources dep tracking
  const sourcesKey = selectedSources.join('|');
  const searchSources = useMemo(
    () => (selectedSources.length > 0 ? selectedSources : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcesKey],
  );

  return (
    <CompendiumPicker
      title={title}
      packIds={filters.packIds}
      documentType={filters.documentType}
      traits={filters.traits}
      anyTraits={filters.anyTraits}
      maxLevel={filters.maxLevel}
      ancestrySlug={filters.ancestrySlug}
      sources={searchSources}
      onPage={onPage}
      onQueryChange={setCurrentQuery}
      filterItem={filterItem}
      sortItems={sortItems}
      renderList={(matches): React.ReactElement => (
        <FeatMatchList
          matches={matches}
          evaluations={evaluations}
          activeUuid={detailTarget?.uuid}
          onSelect={setDetailTarget}
        />
      )}
      filterControls={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SourcePicker sources={sourcesState} selected={selectedSources} onChange={setSelectedSources} />
            <UnmetToggle hide={hideUnmet} onChange={setHideUnmet} />
            <FilterSummary filters={filters} />
          </div>
          <SortToggle sort={sort} onChange={onSortClick} />
        </div>
      }
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
      onPick={onPick}
      onClose={onClose}
      testId="feat-picker"
      resultsTestId="feat-picker-results"
      loadMoreTestId="feat-picker-load-more"
    />
  );
}
