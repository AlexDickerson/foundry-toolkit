import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiRequestError } from '../../api/client';
import type { CompendiumDocument, CompendiumMatch, CompendiumSearchOptions, CompendiumSource } from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import { useDebounce } from '../../lib/useDebounce';
import { useUuidHover } from '../../lib/useUuidHover';
import { evaluateDocument } from '../../prereqs';
import type { CharacterContext, Evaluation } from '../../prereqs';

type SortMode = 'alpha' | 'level';
type SortDir = 'asc' | 'desc';
interface SortState {
  mode: SortMode;
  dir: SortDir;
}

interface Props {
  title: string;
  /** Pre-filters applied to every search. Text query is layered on top.
   *  `packIds` scopes silently (caller concern — which Foundry packs
   *  to read from); the user-visible filter is by publication source. */
  filters: Pick<
    CompendiumSearchOptions,
    'packIds' | 'documentType' | 'traits' | 'anyTraits' | 'maxLevel' | 'ancestrySlug'
  >;
  /** Character state for prereq evaluation. Matches whose prereqs we
   *  can parse + fail get muted; optional "hide unmet" toggle filters
   *  them out entirely. `unknown` (unparseable prereqs) is always
   *  allowed through. Optional — callers without a character context
   *  (e.g. future compendium-browse tools) get the picker with prereq
   *  evaluation skipped. */
  characterContext?: CharacterContext;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; matches: CompendiumMatch[] }
  | { kind: 'error'; message: string };

type SourcesState =
  | { kind: 'loading' }
  | { kind: 'ready'; sources: CompendiumSource[] }
  | { kind: 'error'; message: string };

type DetailState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; doc: CompendiumDocument }
  | { kind: 'error'; message: string };

// Modal picker for creator slot choices. Starts in "browse mode" (no
// q, filters only) and narrows live as the user types. Used by the
// Progression tab for class feat slots; will be reused for ancestry /
// skill / general feat slots.
export function FeatPicker({ title, filters, characterContext, onPick, onClose }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const [sort, setSort] = useState<SortState>({ mode: 'alpha', dir: 'asc' });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sources, setSources] = useState<SourcesState>({ kind: 'loading' });
  const [detailTarget, setDetailTarget] = useState<CompendiumMatch | null>(null);
  const [detail, setDetail] = useState<DetailState>({ kind: 'idle' });
  const [evaluations, setEvaluations] = useState<Map<string, Evaluation>>(new Map());
  const [hideUnmet, setHideUnmet] = useState(true);
  const debouncedQuery = useDebounce(query.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);
  // UUID → full document cache. Populated in the background after each
  // search so clicking a row in the list reveals the detail pane with
  // no spinner. Stays alive for the life of the picker; filters change
  // surface new UUIDs but keep old cache entries valid.
  const docCacheRef = useRef<Map<string, CompendiumDocument>>(new Map());
  // prereq-text (lower-cased) → matching compendium UUID, or null when
  // we've looked and there's no exact-name match. Filled as a side
  // effect of the prefetch (after each doc lands, its prereqs are
  // resolved), so the detail pane's links show up without a per-open
  // round trip.
  const prereqCacheRef = useRef<Map<string, string | null>>(new Map());

  // Apply sort on top of whatever order the server returned. Client-side
  // is fine because the server already caps results (limit 50 by default
  // from the picker), so the sort runs over a tiny array. Entries missing
  // a level always sink to the bottom of a Level sort (in either
  // direction) and stay alpha-asc among themselves — "unknown" shouldn't
  // leapfrog real data just because the user flipped direction.
  //
  // After sorting, optionally drop entries whose prereq evaluation came
  // back `fails`. `unknown` (unparseable) stays through.
  const visibleMatches = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const copy = [...state.matches];
    const dirMul = sort.dir === 'desc' ? -1 : 1;
    if (sort.mode === 'level') {
      const leveled = copy.filter((m) => m.level !== undefined);
      const unlevelled = copy.filter((m) => m.level === undefined);
      leveled.sort((a, b) => {
        const lvlCmp = ((a.level ?? 0) - (b.level ?? 0)) * dirMul;
        if (lvlCmp !== 0) return lvlCmp;
        // Keep intra-tier ordering alpha-asc regardless of direction,
        // so scanning a level band reads left-to-right like a glossary.
        return a.name.localeCompare(b.name);
      });
      unlevelled.sort((a, b) => a.name.localeCompare(b.name));
      return hideUnmet
        ? [...leveled, ...unlevelled].filter((m) => evaluations.get(m.uuid) !== 'fails')
        : [...leveled, ...unlevelled];
    }
    copy.sort((a, b) => a.name.localeCompare(b.name) * dirMul);
    return hideUnmet ? copy.filter((m) => evaluations.get(m.uuid) !== 'fails') : copy;
  }, [state, sort, hideUnmet, evaluations]);

  const onSortClick = (mode: SortMode): void => {
    setSort((prev) =>
      prev.mode === mode
        ? // Re-clicking the active option flips direction.
          { mode, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : // Switching modes resets direction to ascending so users
          // don't carry an expectation from the other axis.
          { mode, dir: 'asc' },
    );
  };

  // Stable filter key for the search effect dep array. Source titles
  // are sorted for order-stability so toggling a checkbox refires the
  // search with the new scope. The caller's `packIds` doesn't change
  // at runtime, so it doesn't need to be in the key.
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

  useEffect(() => {
    let cancelled = false;
    // Deliberately not flipping state back to 'loading' here — that
    // would trigger an extra render (react-hooks/set-state-in-effect)
    // and flash the empty-list state between keystrokes. Instead the
    // previous `ready` matches stay visible until the next response
    // lands, giving a calm "narrow-in-place" feel to the picker.
    const opts: CompendiumSearchOptions = {
      q: debouncedQuery,
      limit: 50,
    };
    if (filters.packIds !== undefined && filters.packIds.length > 0) opts.packIds = filters.packIds;
    if (selectedSources.length > 0) opts.sources = selectedSources;
    if (filters.documentType !== undefined) opts.documentType = filters.documentType;
    if (filters.traits !== undefined) opts.traits = filters.traits;
    if (filters.anyTraits !== undefined) opts.anyTraits = filters.anyTraits;
    if (filters.maxLevel !== undefined) opts.maxLevel = filters.maxLevel;
    if (filters.ancestrySlug !== undefined) opts.ancestrySlug = filters.ancestrySlug;
    api
      .searchCompendium(opts)
      .then((result) => {
        if (cancelled) return;
        setState({ kind: 'ready', matches: result.matches });
        // Background prefetch the full document for each match so the
        // detail pane opens instantly on click. Each worker also
        // resolves that document's prereqs against the compendium and
        // evaluates them against the current character context, so the
        // per-row prereq state lights up without a second trip.
        // Bounded concurrency keeps the network from stampeding when
        // 50 results come back.
        const ctx = characterContext;
        void prefetchDocuments(
          result.matches,
          docCacheRef.current,
          prereqCacheRef.current,
          ctx
            ? (uuid, doc) => {
                if (cancelled) return;
                const evaluation = evaluateDocument(doc, ctx);
                setEvaluations((prev) => {
                  if (prev.get(uuid) === evaluation) return prev;
                  const next = new Map(prev);
                  next.set(uuid, evaluation);
                  return next;
                });
              }
            : undefined,
          () => cancelled,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
    // filterKey captures every filter field; exhaustive-deps is happy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filterKey]);

  // Keep the source-book counts in lockstep with the current search
  // filters (text query, traits, maxLevel). The source filter itself
  // is NOT passed in — we want counts for every source regardless of
  // which ones the user has ticked, so the dropdown reads as "how many
  // matches each source would contribute" (classic multi-select facet
  // behaviour). Packs + documentType stay since those are caller-side
  // invariants.
  const traitsKey = (filters.traits ?? []).join('|');
  useEffect(() => {
    let cancelled = false;
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
    api
      .listCompendiumSources(opts)
      .then((result) => {
        if (cancelled) return;
        setSources({ kind: 'ready', sources: result.sources });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setSources({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.documentType, callerPackIdsKey, debouncedQuery, traitsKey, filters.maxLevel]);

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

  // Freeze page scrolling while the modal is open so mouse-wheel over
  // the backdrop doesn't scroll the sheet underneath. Restore the
  // previous inline value on unmount so we don't clobber anyone else
  // setting it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Fetch the full document whenever the user taps a row. Switching
  // targets fast (e.g. rapid arrow-down through the list) cancels the
  // stale fetch so the panel never flickers back to an older feat.
  // Cache hits short-circuit the fetch entirely, which is the common
  // case once the background prefetch has caught up.
  useEffect(() => {
    if (!detailTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail({ kind: 'idle' });
      return;
    }
    const cached = docCacheRef.current.get(detailTarget.uuid);
    if (cached) {
      setDetail({ kind: 'ready', doc: cached });
      return;
    }
    let cancelled = false;

    setDetail({ kind: 'loading', uuid: detailTarget.uuid });
    api
      .getCompendiumDocument(detailTarget.uuid)
      .then((result) => {
        if (cancelled) return;
        docCacheRef.current.set(detailTarget.uuid, result.document);
        setDetail({ kind: 'ready', doc: result.document });
        if (characterContext) {
          const evaluation = evaluateDocument(result.document, characterContext);
          setEvaluations((prev) => {
            if (prev.get(result.document.uuid) === evaluation) return prev;
            const next = new Map(prev);
            next.set(result.document.uuid, evaluation);
            return next;
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
        setDetail({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [detailTarget?.uuid]);

  const detailOpen = detailTarget !== null;
  return (
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
            className="w-full rounded border border-pf-border bg-white px-2 py-1 text-sm text-pf-text placeholder:text-pf-alt focus:border-pf-primary focus:outline-none"
            data-testid="feat-picker-input"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SourcePicker sources={sources} selected={selectedSources} onChange={setSelectedSources} />
              <UnmetToggle hide={hideUnmet} onChange={setHideUnmet} />
              <FilterSummary filters={filters} />
            </div>
            <SortToggle sort={sort} onChange={onSortClick} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            className={['overflow-y-auto', detailOpen ? 'w-80 shrink-0 border-r border-pf-border' : 'flex-1'].join(' ')}
            data-testid="feat-picker-results"
          >
            {state.kind === 'loading' && <p className="p-4 text-sm italic text-pf-alt">Searching…</p>}
            {state.kind === 'error' && <p className="p-4 text-sm text-pf-primary">Search failed: {state.message}</p>}
            {state.kind === 'ready' && visibleMatches.length === 0 && (
              <p className="p-4 text-sm italic text-pf-alt">No matches. Loosen the filters or search term.</p>
            )}
            {state.kind === 'ready' && visibleMatches.length > 0 && (
              <MatchList
                matches={visibleMatches}
                evaluations={evaluations}
                activeUuid={detailTarget?.uuid}
                onSelect={setDetailTarget}
              />
            )}
          </div>
          {detailOpen && (
            <DetailPanel
              target={detailTarget}
              detail={detail}
              prereqCache={prereqCacheRef}
              onPick={(): void => {
                onPick(detailTarget);
              }}
              onClose={(): void => {
                setDetailTarget(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Prefetch ──────────────────────────────────────────────────────────

const PREFETCH_CONCURRENCY = 4;

// Walks the match list and fills the document + prereq caches in the
// background. Each worker hydrates a doc, then resolves that doc's
// prereqs by exact-name search before moving to the next item. The
// result: by the time a user opens the detail pane for one of these
// matches, both the description and the prereq links are already
// cached.
//
// `isCancelled` lets the caller abort when the modal closes so we
// don't keep hitting the server for a picker the user has already
// dismissed.
async function prefetchDocuments(
  matches: CompendiumMatch[],
  docCache: Map<string, CompendiumDocument>,
  prereqCache: Map<string, string | null>,
  onDocHydrated: ((uuid: string, doc: CompendiumDocument) => void) | undefined,
  isCancelled: () => boolean,
): Promise<void> {
  const queue = matches.filter((m) => !docCache.has(m.uuid));
  // Docs already in the cache still need their evaluation surfaced —
  // the caller's evaluations map is per-render, not persisted.
  if (onDocHydrated) {
    for (const match of matches) {
      const cached = docCache.get(match.uuid);
      if (cached) onDocHydrated(match.uuid, cached);
    }
  }
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0 && !isCancelled()) {
      const match = queue.shift();
      if (!match) break;
      let doc = docCache.get(match.uuid);
      if (!doc) {
        try {
          const result = await api.getCompendiumDocument(match.uuid);
          if (isCancelled()) break;
          doc = result.document;
          docCache.set(match.uuid, doc);
        } catch {
          continue;
        }
      }
      onDocHydrated?.(match.uuid, doc);
      await resolvePrereqsForDoc(doc, prereqCache, isCancelled);
    }
  });
  await Promise.all(workers);
}

async function resolvePrereqsForDoc(
  doc: CompendiumDocument,
  cache: Map<string, string | null>,
  isCancelled: () => boolean,
): Promise<void> {
  const bio = extractDetailBio(doc);
  const prereqs = bio.prerequisites ?? [];
  for (const text of prereqs) {
    if (isCancelled()) return;
    const key = text.toLowerCase();
    if (cache.has(key)) continue;
    try {
      const result = await api.searchCompendium({
        q: text,
        documentType: 'Item',
        limit: 5,
      });
      if (isCancelled()) return;
      const exact = result.matches.find((m) => m.name.toLowerCase() === key);
      cache.set(key, exact?.uuid ?? null);
    } catch {
      cache.set(key, null);
    }
  }
}

// ─── Source (book) multi-select ────────────────────────────────────────

function SourcePicker({
  sources,
  selected,
  onChange,
}: {
  sources: SourcesState;
  selected: string[];
  onChange: (next: string[]) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return (): void => {
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  const count = selected.length;
  const label =
    sources.kind === 'loading' ? 'Sources (…)' : count === 0 ? 'All sources' : `Sources (${count.toString()})`;

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);
  const filtered = useMemo(() => {
    if (sources.kind !== 'ready') return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return sources.sources;
    return sources.sources.filter((s) => s.title.toLowerCase().includes(needle));
  }, [sources, filter]);

  const toggle = (title: string): void => {
    const lower = title.toLowerCase();
    onChange(selectedSet.has(lower) ? selected.filter((s) => s.toLowerCase() !== lower) : [...selected, title]);
  };
  const selectAllVisible = (): void => {
    const nextLowers = new Set(selected.map((s) => s.toLowerCase()));
    const next = [...selected];
    for (const s of filtered) {
      if (!nextLowers.has(s.title.toLowerCase())) {
        next.push(s.title);
        nextLowers.add(s.title.toLowerCase());
      }
    }
    onChange(next);
  };
  const clearAll = (): void => {
    onChange([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="source-picker-trigger"
        onClick={(): void => {
          setOpen((v) => !v);
        }}
        className={[
          'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-colors',
          count > 0
            ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
            : 'border-pf-border bg-white text-pf-alt-dark hover:text-pf-primary',
        ].join(' ')}
      >
        {label} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div
          role="listbox"
          data-testid="source-picker-panel"
          className="absolute left-0 top-full z-10 mt-1 flex max-h-72 w-80 flex-col rounded border border-pf-border bg-white shadow-lg"
        >
          <div className="flex items-center gap-1 border-b border-pf-border p-2">
            <input
              type="search"
              value={filter}
              onChange={(e): void => {
                setFilter(e.target.value);
              }}
              placeholder="Filter sources…"
              className="flex-1 rounded border border-pf-border bg-white px-2 py-0.5 text-xs text-pf-text placeholder:text-pf-alt focus:border-pf-primary focus:outline-none"
              data-testid="source-picker-filter"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-pf-border px-2 py-1 text-[10px] uppercase tracking-widest">
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-pf-alt-dark hover:text-pf-primary"
              data-testid="source-picker-select-all"
            >
              Select visible
            </button>
            <span className="text-pf-border">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-pf-alt-dark hover:text-pf-primary"
              data-testid="source-picker-clear"
            >
              Clear
            </button>
            <span className="ml-auto text-pf-alt">
              {sources.kind === 'ready' ? `${filtered.length.toString()} shown` : ''}
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {sources.kind === 'loading' && <li className="p-2 text-xs italic text-pf-alt">Loading sources…</li>}
            {sources.kind === 'error' && (
              <li className="p-2 text-xs text-pf-primary">Failed to load sources: {sources.message}</li>
            )}
            {sources.kind === 'ready' && filtered.length === 0 && (
              <li className="p-2 text-xs italic text-pf-alt">No sources match that filter.</li>
            )}
            {sources.kind === 'ready' &&
              filtered.map((src) => {
                const active = selectedSet.has(src.title.toLowerCase());
                return (
                  <li key={src.title}>
                    <label
                      data-source-title={src.title}
                      className={[
                        'flex cursor-pointer items-center gap-2 px-2 py-1 text-xs',
                        active ? 'bg-pf-tertiary/40' : 'hover:bg-pf-tertiary/20',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(): void => {
                          toggle(src.title);
                        }}
                        className="accent-pf-primary"
                      />
                      <span className="flex-1 truncate text-pf-text">{src.title}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-pf-alt">{src.count}</span>
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SortToggle({ sort, onChange }: { sort: SortState; onChange: (mode: SortMode) => void }): React.ReactElement {
  const options: Array<{ value: SortMode; label: string }> = [
    { value: 'alpha', label: 'A–Z' },
    { value: 'level', label: 'Level' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Sort results"
      data-testid="feat-picker-sort"
      className="inline-flex shrink-0 overflow-hidden rounded border border-pf-border text-[10px] font-semibold uppercase tracking-widest"
    >
      {options.map((opt) => {
        const active = sort.mode === opt.value;
        const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-sort-option={opt.value}
            data-sort-dir={active ? sort.dir : undefined}
            title={
              active
                ? `Sorting ${opt.label} ${sort.dir === 'asc' ? '↑' : '↓'} — click to reverse`
                : `Sort by ${opt.label}`
            }
            onClick={(): void => {
              onChange(opt.value);
            }}
            className={[
              'px-2 py-0.5 transition-colors',
              active
                ? 'bg-pf-primary text-white'
                : 'bg-white text-pf-alt-dark hover:bg-pf-tertiary/40 hover:text-pf-primary',
            ].join(' ')}
          >
            {opt.label}
            {arrow}
          </button>
        );
      })}
    </div>
  );
}

function UnmetToggle({ hide, onChange }: { hide: boolean; onChange: (next: boolean) => void }): React.ReactElement {
  return (
    <label
      data-testid="feat-picker-hide-unmet"
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark"
    >
      <input
        type="checkbox"
        checked={hide}
        onChange={(e): void => {
          onChange(e.target.checked);
        }}
        className="accent-pf-primary"
      />
      Hide unmet
    </label>
  );
}

function FilterSummary({ filters }: { filters: Props['filters'] }): React.ReactElement | null {
  const parts: string[] = [];
  if (filters.traits && filters.traits.length > 0) parts.push(`traits: ${filters.traits.join(', ')}`);
  if (filters.maxLevel !== undefined) parts.push(`level ≤ ${filters.maxLevel.toString()}`);
  if (parts.length === 0) return null;
  return <p className="text-[10px] uppercase tracking-widest text-pf-alt">{parts.join(' · ')}</p>;
}

// Split results into ancestry-specific + versatile buckets when any
// match carries `isVersatile`. Keeps the existing flat list otherwise
// so non-heritage searches render unchanged.
function MatchList({
  matches,
  evaluations,
  activeUuid,
  onSelect,
}: {
  matches: CompendiumMatch[];
  evaluations: Map<string, Evaluation>;
  activeUuid: string | undefined;
  onSelect: (m: CompendiumMatch) => void;
}): React.ReactElement {
  const ancestrySpecific = matches.filter((m) => m.isVersatile !== true);
  const versatile = matches.filter((m) => m.isVersatile === true);

  if (versatile.length === 0) {
    return (
      <ul className="divide-y divide-pf-border">
        {matches.map((match) => (
          <li key={match.uuid}>
            <MatchRow
              match={match}
              active={activeUuid === match.uuid}
              evaluation={evaluations.get(match.uuid)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {ancestrySpecific.length > 0 && (
        <ul className="divide-y divide-pf-border" data-match-group="ancestry-specific">
          {ancestrySpecific.map((match) => (
            <li key={match.uuid}>
              <MatchRow
                match={match}
                active={activeUuid === match.uuid}
                evaluation={evaluations.get(match.uuid)}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
      <h3 className="border-t border-pf-border bg-pf-bg-dark/40 px-3 py-1.5 font-serif text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">
        Versatile Heritages
      </h3>
      <ul className="divide-y divide-pf-border" data-match-group="versatile">
        {versatile.map((match) => (
          <li key={match.uuid}>
            <MatchRow
              match={match}
              active={activeUuid === match.uuid}
              evaluation={evaluations.get(match.uuid)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function MatchRow({
  match,
  active,
  evaluation,
  onSelect,
}: {
  match: CompendiumMatch;
  active: boolean;
  evaluation: Evaluation | undefined;
  onSelect: (match: CompendiumMatch) => void;
}): React.ReactElement {
  const traitsSummary = match.traits && match.traits.length > 0 ? match.traits.slice(0, 5).join(', ') : '';
  const fails = evaluation === 'fails';
  const unknown = evaluation === 'unknown';
  const rowTitle = fails
    ? "Character doesn't meet this feat's prerequisites"
    : unknown
      ? "Prereqs couldn't be auto-checked — verify manually before picking"
      : undefined;
  return (
    <button
      type="button"
      onClick={(): void => {
        onSelect(match);
      }}
      data-match-uuid={match.uuid}
      data-prereq-state={evaluation ?? 'pending'}
      aria-pressed={active}
      title={rowTitle}
      className={[
        'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
        active ? 'bg-pf-tertiary/50' : 'hover:bg-pf-tertiary/20',
        fails ? 'opacity-60' : '',
      ].join(' ')}
    >
      {match.img && (
        <img src={match.img} alt="" className="h-8 w-8 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-medium text-pf-text">{match.name}</span>
            {unknown && (
              <span
                data-testid="prereq-unknown-badge"
                aria-label="Prereqs unchecked"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500 bg-amber-100 text-[10px] font-semibold text-amber-800"
              >
                !
              </span>
            )}
          </span>
          {match.level !== undefined && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
              L{match.level}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 text-[10px] text-pf-alt">
          <span className="truncate">{match.packLabel}</span>
          {traitsSummary && <span className="truncate">{traitsSummary}</span>}
        </div>
      </div>
    </button>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────

function DetailPanel({
  target,
  detail,
  prereqCache,
  onPick,
  onClose,
}: {
  target: CompendiumMatch | null;
  detail: DetailState;
  /** Shared cache — populated by the list-level prefetch, read here. */
  prereqCache: React.RefObject<Map<string, string | null>>;
  onPick: () => void;
  onClose: () => void;
}): React.ReactElement | null {
  const uuidHover = useUuidHover();
  const [prereqResolutions, setPrereqResolutions] = useState<Map<string, string | null>>(new Map());

  const doc = detail.kind === 'ready' ? detail.doc : null;
  const bio = extractDetailBio(doc);
  const prereqsKey = (bio.prerequisites ?? []).join('|');

  useEffect(() => {
    const prereqs = bio.prerequisites;
    if (!prereqs || prereqs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrereqResolutions(new Map());
      return;
    }
    let cancelled = false;
    const initial = new Map<string, string | null>();
    for (const p of prereqs) {
      const cached = prereqCache.current.get(p.toLowerCase());
      if (cached !== undefined) initial.set(p, cached);
    }

    setPrereqResolutions(initial);

    // The prefetch usually has these cached already, but fall back to
    // an on-demand lookup for anything still missing (e.g. the user
    // opened the panel before the prefetch got to this item).
    void (async () => {
      await Promise.all(
        prereqs.map(async (text) => {
          const key = text.toLowerCase();
          if (prereqCache.current.has(key)) return;
          try {
            const response = await api.searchCompendium({
              q: text,
              documentType: 'Item',
              limit: 5,
            });
            // Exact-name only. "trained in Intimidation" won't hit
            // anything; "Dragon Instinct" will.
            const exact = response.matches.find((m) => m.name.toLowerCase() === key);
            const uuid = exact?.uuid ?? null;
            prereqCache.current.set(key, uuid);
            if (!cancelled) {
              setPrereqResolutions((prev) => {
                const next = new Map(prev);
                next.set(text, uuid);
                return next;
              });
            }
          } catch {
            prereqCache.current.set(key, null);
            if (!cancelled) {
              setPrereqResolutions((prev) => {
                const next = new Map(prev);
                next.set(text, null);
                return next;
              });
            }
          }
        }),
      );
    })();

    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prereqsKey]);

  if (!target) return null;
  return (
    <aside className="flex min-w-0 flex-1 flex-col" data-testid="feat-picker-detail" data-detail-uuid={target.uuid}>
      <header className="flex items-start gap-3 border-b border-pf-border px-4 py-3">
        {target.img && (
          <img src={target.img} alt="" className="h-12 w-12 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-semibold text-pf-text">{target.name}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-pf-alt">
            {target.packLabel}
            {target.level !== undefined && ` · L${target.level.toString()}`}
          </p>
          {target.traits && target.traits.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {target.traits.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {detail.kind === 'loading' && <p className="text-sm italic text-pf-alt">Loading…</p>}
        {detail.kind === 'error' && <p className="text-sm text-pf-primary">Failed to load: {detail.message}</p>}
        {detail.kind === 'ready' && (
          <div className="space-y-3">
            {bio.prerequisites && bio.prerequisites.length > 0 && (
              <PrereqRow prereqs={bio.prerequisites} resolutions={prereqResolutions} />
            )}
            {bio.actions && <DetailRow label="Actions" value={bio.actions} />}
            {bio.trigger && <DetailRow label="Trigger" value={bio.trigger} />}
            {bio.frequency && <DetailRow label="Frequency" value={bio.frequency} />}
            {bio.requirements && <DetailRow label="Requirements" value={bio.requirements} />}
            {bio.description && (
              <div
                {...uuidHover.delegationHandlers}
                className="text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2 [&_p]:leading-relaxed"
                // Trusted source: our own Foundry. enrichDescription converts
                // Foundry enricher tokens (@UUID, @Damage, @Template, @Check,
                // [[/r …]]) into styled inline elements.
                dangerouslySetInnerHTML={{ __html: enrichDescription(bio.description) }}
              />
            )}
            {uuidHover.popover}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-pf-border bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-alt-dark hover:text-pf-primary"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onPick}
          data-testid="feat-picker-pick"
          className="rounded border border-pf-primary bg-pf-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white hover:brightness-110"
        >
          Pick {target.name}
        </button>
      </footer>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</dt>
      <dd className="text-sm text-pf-text">{value}</dd>
    </div>
  );
}

function PrereqRow({
  prereqs,
  resolutions,
}: {
  prereqs: string[];
  resolutions: Map<string, string | null>;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
        Prerequisites
      </dt>
      <dd className="text-sm text-pf-text">
        {prereqs.map((p, i) => {
          // resolutions === undefined → lookup still pending, render
          // as plain text (will upgrade to link on resolve)
          // resolutions.get === null → looked, no exact match
          const uuid = resolutions.get(p);
          return (
            <span key={`${p}-${i.toString()}`}>
              {i > 0 && '; '}
              {uuid ? (
                <a data-uuid={uuid} className="cursor-pointer text-pf-primary underline" title={uuid}>
                  {p}
                </a>
              ) : (
                p
              )}
            </span>
          );
        })}
      </dd>
    </div>
  );
}

interface DetailBio {
  description?: string;
  prerequisites?: string[];
  actions?: string;
  trigger?: string;
  frequency?: string;
  requirements?: string;
}

// pf2e item system shape is polymorphic. Pull the fields we care about
// defensively — the server returns raw `system` from toObject() so we
// don't want to lock this to one type's schema.
function extractDetailBio(doc: CompendiumDocument | null): DetailBio {
  if (!doc) return {};
  const sys = doc.system;
  const bio: DetailBio = {};

  const description = (sys['description'] as { value?: unknown } | undefined)?.value;
  if (typeof description === 'string' && description.length > 0) bio.description = description;

  const prereq = (sys['prerequisites'] as { value?: unknown } | undefined)?.value;
  if (Array.isArray(prereq)) {
    const entries = prereq
      .map((p) => (typeof p === 'string' ? p : (p as { value?: unknown } | undefined)?.value))
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (entries.length > 0) bio.prerequisites = entries;
  }

  const actions = (sys['actions'] as { value?: unknown } | undefined)?.value;
  if (typeof actions === 'number') bio.actions = `${actions.toString()} action${actions === 1 ? '' : 's'}`;
  else if (typeof actions === 'string' && actions.length > 0) bio.actions = actions;

  const actionType = (sys['actionType'] as { value?: unknown } | undefined)?.value;
  if (typeof actionType === 'string' && actionType.length > 0 && bio.actions === undefined) {
    bio.actions = actionType.charAt(0).toUpperCase() + actionType.slice(1);
  }

  const trigger = sys['trigger'];
  if (typeof trigger === 'string' && trigger.length > 0) bio.trigger = trigger;

  const frequency = (sys['frequency'] as { value?: unknown } | undefined)?.value;
  if (typeof frequency === 'string' && frequency.length > 0) bio.frequency = frequency;

  const requirements = sys['requirements'];
  if (typeof requirements === 'string' && requirements.length > 0) bio.requirements = requirements;

  return bio;
}
