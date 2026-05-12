import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '@/features/characters/api';
import type {
  CompendiumDocument,
  CompendiumMatch,
  CompendiumSearchOptions,
  CompendiumSource,
} from '@/features/characters/types';
import { type RemoteDataState, useRemoteData } from '@/shared/hooks/useRemoteData';
import type { CharacterContext, Evaluation } from '@/features/characters/internal/prereqs';
import { evaluateDocument } from '@/features/characters/internal/prereqs';
import type { CompendiumPickerProps } from '@/features/characters/internal/CompendiumPicker';
import { prefetchDocuments } from './compendium-prefetch';
import {
  type SortMode,
  type SortState,
  FilterSummary,
  RarityPicker,
  SourcePicker,
  SortToggle,
  UnmetToggle,
} from './CompendiumFilters';

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
  | 'rarities'
  | 'onPage'
  | 'onQueryChange'
  | 'filterItem'
  | 'sortItems'
  | 'filterControls'
  | 'evaluations'
  | 'docCache'
  | 'detailHideHeader'
  | 'listOpenWidthClass'
> & {
  onPick: (match: CompendiumMatch) => void;
};

export interface CreatorPickerOptions {
  /** Default source-book filter on first mount. Pass e.g.
   *  `['Pathfinder Player Core', 'Pathfinder Player Core 2']` to scope
   *  the initial list to Player Core options; the player can broaden it
   *  via the source picker. Defaults to undefined (no source filter). */
  initialSources?: string[];
  /** Default rarities filter on first mount. Pass `['common']` to hide
   *  uncommon/rare/unique by default (the player can still toggle them
   *  on via the rarity pills). Defaults to undefined (no rarity filter). */
  initialRarities?: string[];
  /** Filter-row visibility flags. Each filter is on by default; set to
   *  `false` to suppress it for a target that doesn't need it (e.g.
   *  ancestry/background pickers hide the unmet-prereq toggle and the
   *  alpha/level sort because those targets have no prereqs and are
   *  all the same level). */
  showSourcePicker?: boolean;
  /** Explicit override. When omitted, the rarity picker is shown iff
   *  `initialRarities` was provided. */
  showRarityPicker?: boolean;
  showUnmetToggle?: boolean;
  showSortToggle?: boolean;
  /** Hide the CompendiumDetailPanel's top header (image + name + meta +
   *  traits) for this target. Useful when the picker dialog's title bar
   *  already shows the name and the panel body has enough visual
   *  identity on its own (class panels). Defaults to false. */
  hideDetailHeader?: boolean;
  /** Tailwind width class for the list column when the detail panel is
   *  open. Tightens the list so the detail panel — usually the more
   *  information-dense side — gets the room. */
  listOpenWidthClass?: string;
}

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
  options?: CreatorPickerOptions,
): CreatorPickerProps {
  const [sort, setSort] = useState<SortState>({ mode: 'alpha', dir: 'asc' });
  const [selectedSources, setSelectedSources] = useState<string[]>(() => options?.initialSources ?? []);
  const [selectedRarities, setSelectedRarities] = useState<string[]>(() => options?.initialRarities ?? []);
  const [evaluations, setEvaluations] = useState<Map<string, Evaluation>>(new Map());
  const [hideUnmet, setHideUnmet] = useState(true);
  const [currentQuery, setCurrentQuery] = useState('');
  const docCacheRef = useRef<Map<string, CompendiumDocument>>(new Map());
  const prereqCacheRef = useRef<Map<string, string | null>>(new Map());

  const callerPackIdsKey = (filters.packIds ?? []).join('|');
  const traitsKey = (filters.traits ?? []).join('|');

  const sourcesState: RemoteDataState<CompendiumSource[]> = useRemoteData<CompendiumSource[]>(async () => {
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
  }, [filters.documentType, callerPackIdsKey, currentQuery, traitsKey, filters.maxLevel]);

  const onSortClick = (mode: SortMode): void => {
    setSort((prev) => (prev.mode === mode ? { mode, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { mode, dir: 'asc' }));
  };

  const onPage = useCallback(
    (newMatches: CompendiumMatch[], isCancelled: () => boolean): void => {
      const ctx = characterContext;
      void prefetchDocuments(newMatches, docCacheRef.current, {
        isCancelled,
        prereqCache: prereqCacheRef.current,
        ...(ctx
          ? {
              onDocHydrated: (uuid, doc): void => {
                if (isCancelled()) return;
                const evaluation = evaluateDocument(doc, ctx);
                setEvaluations((prev) => {
                  if (prev.get(uuid) === evaluation) return prev;
                  const next = new Map(prev);
                  next.set(uuid, evaluation);
                  return next;
                });
              },
            }
          : {}),
      });
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

  const raritiesKey = selectedRarities.join('|');
  const searchRarities = useMemo(
    () => (selectedRarities.length > 0 ? selectedRarities : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raritiesKey],
  );

  // Per-control visibility. Each filter defaults to on; callers opt out
  // for targets where the control doesn't earn its space (ancestry /
  // background hide the unmet toggle and the sort toggle). The rarity
  // picker also requires `initialRarities` to be provided so callers
  // can't accidentally render an unbound rarity control.
  const showSourcePicker = options?.showSourcePicker ?? true;
  const showRarityPicker = options?.showRarityPicker ?? options?.initialRarities !== undefined;
  const showUnmetToggle = options?.showUnmetToggle ?? true;
  const showSortToggle = options?.showSortToggle ?? true;

  const filterControls = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showSourcePicker && (
          <SourcePicker sources={sourcesState} selected={selectedSources} onChange={setSelectedSources} />
        )}
        {showRarityPicker && <RarityPicker selected={selectedRarities} onChange={setSelectedRarities} />}
        {showUnmetToggle && <UnmetToggle hide={hideUnmet} onChange={setHideUnmet} />}
        <FilterSummary filters={filters} />
      </div>
      {showSortToggle && <SortToggle sort={sort} onChange={onSortClick} />}
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
  if (searchRarities !== undefined) props.rarities = searchRarities;
  if (options?.hideDetailHeader === true) props.detailHideHeader = true;
  if (options?.listOpenWidthClass !== undefined) props.listOpenWidthClass = options.listOpenWidthClass;
  return props;
}
