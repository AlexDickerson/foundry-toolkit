import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '@/features/characters/api';
import type {
  CompendiumDocument,
  CompendiumMatch,
  CompendiumSearchOptions,
  CompendiumSource,
} from '@/features/characters/types';
import { type RemoteDataState, useRemoteData } from '@/_quarantine/lib/useRemoteData';
import type { CharacterContext, Evaluation } from '@/features/characters/internal/prereqs';
import { evaluateDocument } from '@/features/characters/internal/prereqs';
import type { CompendiumPickerProps } from '@/_quarantine/picker';
import { prefetchDocuments } from './feat-prefetch';
import { type SortMode, type SortState, FilterSummary, SourcePicker, SortToggle, UnmetToggle } from './FeatFilters';

type CreatorFilters = Pick<
  CompendiumSearchOptions,
  'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'maxLevel' | 'ancestrySlug'
>;

type CreatorPickerProps = Pick<
  CompendiumPickerProps,
  | 'packIds'
  | 'documentType'
  | 'traits'
  | 'anyTraits'
  | 'maxLevel'
  | 'ancestrySlug'
  | 'sources'
  | 'onPage'
  | 'onQueryChange'
  | 'filterItem'
  | 'sortItems'
  | 'filterControls'
  | 'evaluations'
  | 'docCache'
> & {
  onPick: (match: CompendiumMatch) => void;
};

// Builds the props the character creator's picks need on top of the
// shared CompendiumPicker: source-book filter, alpha/level sort, prereq
// evaluation + hide-unmet toggle, and a doc/eval cache fed by background
// prefetch. The picker uses CompendiumPicker's own row + detail panel —
// prereq awareness is conveyed via the `evaluations` map which the
// shared row + detail panel already understand.
export function useCreatorPickerProps(
  filters: CreatorFilters,
  characterContext: CharacterContext | undefined,
  onPickCallback: (match: CompendiumMatch) => void,
): CreatorPickerProps {
  const [sort, setSort] = useState<SortState>({ mode: 'alpha', dir: 'asc' });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<Map<string, Evaluation>>(new Map());
  const [hideUnmet, setHideUnmet] = useState(true);
  const [currentQuery, setCurrentQuery] = useState('');
  const docCacheRef = useRef<Map<string, CompendiumDocument>>(new Map());
  const prereqCacheRef = useRef<Map<string, string | null>>(new Map());

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

  const sourcesKey = selectedSources.join('|');
  const searchSources = useMemo(
    () => (selectedSources.length > 0 ? selectedSources : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcesKey],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <SourcePicker sources={sourcesState} selected={selectedSources} onChange={setSelectedSources} />
        <UnmetToggle hide={hideUnmet} onChange={setHideUnmet} />
        <FilterSummary filters={filters} />
      </div>
      <SortToggle sort={sort} onChange={onSortClick} />
    </div>
  );

  // `exactOptionalPropertyTypes: true` requires optional fields to be
  // omitted rather than set to undefined.
  const props: CreatorPickerProps = {
    onPick: onPickCallback,
    onPage,
    onQueryChange: setCurrentQuery,
    filterItem,
    sortItems,
    filterControls,
    evaluations,
    docCache: docCacheRef.current,
  };
  if (filters.packIds !== undefined) props.packIds = filters.packIds;
  if (filters.documentType !== undefined) props.documentType = filters.documentType;
  if (filters.traits !== undefined) props.traits = filters.traits;
  if (filters.anyTraits !== undefined) props.anyTraits = filters.anyTraits;
  if (filters.maxLevel !== undefined) props.maxLevel = filters.maxLevel;
  if (filters.ancestrySlug !== undefined) props.ancestrySlug = filters.ancestrySlug;
  if (searchSources !== undefined) props.sources = searchSources;
  return props;
}
