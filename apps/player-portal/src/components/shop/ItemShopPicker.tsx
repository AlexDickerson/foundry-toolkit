import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import type {
  CompendiumDocument,
  CompendiumMatch,
  CompendiumSearchOptions,
  ItemPrice,
  PreparedActorItem,
} from '../../api/types';
import { formatCp, priceToCp, sumActorCoinsCp } from '../../lib/coins';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';

export interface BuyRequest {
  match: CompendiumMatch;
  unitPriceCp: number;
}

interface Props {
  items: readonly PreparedActorItem[];
  onBuy: (req: BuyRequest) => Promise<void>;
  pending: Set<string>;
}

// Equipment packs available for browsing. More packs can be appended
// here — the server reads all of them via CompendiumSearchOptions.packIds.
const EQUIPMENT_PACKS: readonly { id: string; label: string }[] = [
  { id: 'pf2e.equipment-srd', label: 'Equipment' },
];

// Narrower item-type filter chips. Names follow pf2e's
// `system.category` / `type` taxonomy loosely; the picker uses them
// as a free-text filter that checks a match's displayed type + traits.
type TypeFilter = 'all' | 'weapon' | 'armor' | 'consumable' | 'equipment' | 'backpack';

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'consumable', label: 'Consumables' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'backpack', label: 'Containers' },
];

const DEBOUNCE_MS = 220;
// Server cap (foundry-mcp src/http/schemas.ts) is 10k; keep the
// client request below that so a single round-trip fits every item
// in the largest pf2e pack (equipment-srd ≈ 5.6k). Cached searches
// filter/sort in-memory (microseconds); uncached searches iterate
// the full index either way, so this ceiling just sizes the response.
// The banner below the grid still kicks in on the rare search that
// would exceed this — narrowing by type/name/level keeps it cheap.
const SEARCH_LIMIT = 10_000;

// Conservative fallback page size when the ResizeObserver hasn't
// measured the grid yet (e.g. first render, or in unit tests that
// render outside a real DOM). The visible page adapts to the grid's
// actual dimensions on mount via `useFitPageSize` below.
const FALLBACK_PAGE_SIZE = 25;

// Grid column count — fixed to match the `repeat(5, ...)` template.
const GRID_COLS = 5;
// Approximate tile height (including gap). Used with ResizeObserver to
// compute how many whole rows fit in the available grid area.
const TILE_HEIGHT_PX = 146; // ≈ img h-12 + name line + level + price + buy btn + padding
const GRID_GAP_PX = 8;
// Floor for the computed page size so we never land on "0 tiles per
// page" in extremely narrow viewports.
const MIN_FIT_PAGE_SIZE = 6;

// Breathing room between the grid's bottom edge and the viewport's
// bottom. Sized to cover the sibling content below the grid that the
// grid itself doesn't account for: the bottom pagination bar (~32px)
// plus the main container's bottom padding (p-6 = 24px), with a
// small safety margin so a horizontal scrollbar never kicks in.
const VIEWPORT_BOTTOM_MARGIN_PX = 72;

function useFitPageSize(): {
  pageSize: number;
  maxHeight: number | null;
  gridRef: (el: HTMLUListElement | null) => void;
} {
  const [pageSize, setPageSize] = useState(FALLBACK_PAGE_SIZE);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  // The grid is conditionally rendered (only after results arrive),
  // so a plain RefObject whose effect runs once on mount would never
  // see the populated element. A callback ref fires synchronously
  // when the element attaches/detaches, so we wire the observer
  // there instead of in a useEffect.
  const [gridEl, setGridEl] = useState<HTMLUListElement | null>(null);
  const gridRef = useCallback((el: HTMLUListElement | null) => {
    setGridEl(el);
  }, []);

  useEffect(() => {
    if (!gridEl || typeof ResizeObserver === 'undefined') return;
    const recompute = (): void => {
      // Derive the vertical budget from the grid's own offset in the
      // viewport rather than hard-coding "minus some rem". That way
      // the cap adapts when the header, filter bar, or chip row
      // changes height — grid stays fully above the fold regardless.
      const rect = gridEl.getBoundingClientRect();
      const availableHeight = Math.max(200, window.innerHeight - rect.top - VIEWPORT_BOTTOM_MARGIN_PX);
      setMaxHeight(availableHeight);

      const rows = Math.max(1, Math.floor((availableHeight + GRID_GAP_PX) / (TILE_HEIGHT_PX + GRID_GAP_PX)));
      setPageSize(Math.max(MIN_FIT_PAGE_SIZE, GRID_COLS * rows));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(gridEl);
    // Grid's offset can change when the window height changes even
    // if its own size doesn't (ResizeObserver wouldn't fire). Hook
    // window resize too.
    window.addEventListener('resize', recompute);
    return (): void => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [gridEl]);

  return { pageSize, maxHeight, gridRef };
}

export function ItemShopPicker({ items, onBuy, pending }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [maxLevel, setMaxLevel] = useState<number | ''>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [packId, setPackId] = useState<string>(EQUIPMENT_PACKS[0]?.id ?? '');
  const [matches, setMatches] = useState<CompendiumMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Zero-indexed page within the current filtered result set.
  // Re-zeroed whenever any filter input changes so the user never
  // ends up on an out-of-range page after narrowing.
  const [page, setPage] = useState(0);
  // Prefetched prices keyed by uuid. `undefined` means "not yet
  // fetched", `null` means "fetched but no price / error — treat as 0".
  const [prices, setPrices] = useState<Map<string, ItemPrice | null>>(new Map());
  // When non-null, the item detail overlay covers the grid. The
  // match carries the identifying uuid + lean fields; the overlay
  // lazily fetches the full document for description + traits.
  const [selectedMatch, setSelectedMatch] = useState<CompendiumMatch | null>(null);

  const purseCp = useMemo(() => sumActorCoinsCp(items), [items]);

  // Debounce the search-as-you-type so the picker doesn't fire a
  // compendium query on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return (): void => {
      window.clearTimeout(t);
    };
  }, [query]);

  // Track the latest search invocation so stale responses don't
  // overwrite fresh ones if the user changes filters mid-flight.
  const searchTokenRef = useRef(0);
  useEffect(() => {
    if (packId === '') return;
    const token = ++searchTokenRef.current;
    const opts: CompendiumSearchOptions = {
      packIds: [packId],
      documentType: 'Item',
      limit: SEARCH_LIMIT,
      ...(debouncedQuery.length > 0 ? { q: debouncedQuery } : {}),
      ...(maxLevel !== '' ? { maxLevel } : {}),
    };
    // Kick off loading state in a microtask so React doesn't treat
    // the synchronous setState in this effect as a cascade.
    queueMicrotask(() => {
      if (token !== searchTokenRef.current) return;
      setLoading(true);
      setError(null);
    });
    api
      .searchCompendium(opts)
      .then((result) => {
        if (token !== searchTokenRef.current) return;
        setMatches(result.matches);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (token !== searchTokenRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      });
  }, [debouncedQuery, maxLevel, packId]);

  const filtered = useMemo(() => {
    const typed = filterMatchesByType(matches, typeFilter);
    // Hide items with a known price of 0 cp — those are class/feat
    // effect tokens or other "not actually for sale" artifacts that
    // the compendium still carries as `Item` docs. Matches without a
    // price field at all (e.g. uncached packs where price isn't
    // embedded) remain visible; the tile price prefetch and the
    // detail overlay pick up the real number later.
    return typed.filter((m) => m.price === undefined || priceToCp(m.price) > 0);
  }, [matches, typeFilter]);
  // The grid's height is capped (see `gridRef` below) and the page
  // size adapts to however many tiles fit at the current viewport via
  // ResizeObserver + window-resize. Falling back to
  // FALLBACK_PAGE_SIZE before the first measurement keeps SSR/tests
  // deterministic.
  const { pageSize, maxHeight, gridRef } = useFitPageSize();
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp on every render so the page stays valid even if the result
  // set shrinks (e.g. stricter filter) between renders. The effect
  // below resets to page 0 on filter input changes; this clamp
  // protects against any other shrink paths (e.g. async refetch).
  const clampedPage = Math.min(page, pageCount - 1);
  const pageStart = clampedPage * pageSize;
  const pageSlice = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize],
  );

  // Any filter input change → back to page 0. Keeps the user from
  // landing on "page 27 of 2" after narrowing a 1000-result search
  // down to 80. Done via a render-time comparison (React's
  // recommended pattern for derived reset state) rather than an
  // effect, which would trigger the set-state-in-effect lint and an
  // extra render pass.
  const filterKey = `${debouncedQuery}|${maxLevel.toString()}|${packId}|${typeFilter}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(0);
  }

  // Prefetch prices for results that didn't come with `match.price`
  // already attached. Cached packs (served from foundry-mcp's
  // compendium-cache) embed the price on each match, so this loop
  // short-circuits — no per-tile getCompendiumDocument calls in the
  // common case. Scoped to the current page so uncached packs don't
  // fire off thousands of fetches up-front.
  useEffect(() => {
    const needed = pageSlice.filter((m) => m.price === undefined && !prices.has(m.uuid));
    if (needed.length === 0) return;
    let cancelled = false;
    const queue = [...needed];
    const CONCURRENCY = 6;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        if (cancelled) return;
        const m = queue.shift();
        if (!m) break;
        try {
          const { document } = await api.getCompendiumDocument(m.uuid);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled toggles asynchronously in cleanup
          if (cancelled) return;
          setPrices((prev) => {
            if (prev.has(m.uuid)) return prev;
            const next = new Map(prev);
            next.set(m.uuid, extractPriceFromDocument(document));
            return next;
          });
        } catch {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled toggles asynchronously in cleanup
          if (cancelled) return;
          setPrices((prev) => {
            if (prev.has(m.uuid)) return prev;
            const next = new Map(prev);
            next.set(m.uuid, null);
            return next;
          });
        }
      }
    });
    void Promise.all(workers);
    return (): void => {
      cancelled = true;
    };
  }, [pageSlice, prices]);

  const emptyResults = filtered.length === 0;

  return (
    <div className="space-y-2" data-section="shop-picker">
      {/* Single-row control strip: search (flex-1), max-level, optional
          pack selector, then pagination pinned to the right. Keeps the
          shop's chrome to ~2 rows (this row + the type-chip row). */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          placeholder="Search equipment…"
          onChange={(e): void => {
            setQuery(e.target.value);
          }}
          className="min-w-[10rem] flex-1 rounded border border-pf-border bg-white px-2 py-1 text-sm"
          data-testid="shop-search"
        />
        <label className="flex items-center gap-1 text-xs text-pf-alt-dark">
          <span>Max level</span>
          <input
            type="number"
            min={0}
            max={30}
            value={maxLevel}
            onChange={(e): void => {
              const v = e.target.value;
              setMaxLevel(v === '' ? '' : Number(v));
            }}
            className="w-16 rounded border border-pf-border bg-white px-1 py-0.5 text-sm"
          />
        </label>
        {EQUIPMENT_PACKS.length > 1 && (
          <select
            value={packId}
            onChange={(e): void => {
              setPackId(e.target.value);
            }}
            className="rounded border border-pf-border bg-white px-2 py-1 text-sm"
          >
            {EQUIPMENT_PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {!emptyResults && (
          <PaginationControls
            page={clampedPage}
            pageCount={pageCount}
            onPageChange={setPage}
            capHit={matches.length >= SEARCH_LIMIT}
            capLimit={SEARCH_LIMIT}
          />
        )}
      </div>

      <ul className="flex flex-wrap gap-1" role="group" aria-label="Item type filter">
        {TYPE_FILTERS.map((tf) => (
          <li key={tf.id}>
            <button
              type="button"
              aria-pressed={typeFilter === tf.id}
              onClick={(): void => {
                setTypeFilter(tf.id);
              }}
              className={[
                'rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider',
                typeFilter === tf.id
                  ? 'border-pf-primary bg-pf-primary text-white'
                  : 'border-pf-border bg-white text-pf-alt-dark hover:bg-pf-bg-dark/40',
              ].join(' ')}
            >
              {tf.label}
            </button>
          </li>
        ))}
      </ul>

      {error !== null && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          Search failed: {error}
        </p>
      )}

      {loading && emptyResults ? (
        <p className="text-sm italic text-pf-alt-dark">Loading…</p>
      ) : emptyResults ? (
        <p className="text-sm italic text-pf-alt-dark">No items match.</p>
      ) : (
        <>
          {/* `relative` scopes the detail overlay's `absolute inset-0`
              so it covers only the grid area, not the whole page. */}
          <div className="relative">
            <ul
              ref={gridRef}
              className="grid gap-2 overflow-hidden"
              style={{
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                // maxHeight is measured from the grid's live offset so
                // the grid never extends past the viewport. Falls back
                // to a conservative ceiling before the first measure.
                maxHeight: maxHeight !== null ? `${maxHeight.toString()}px` : 'calc(100dvh - 20rem)',
              }}
              data-testid="shop-grid"
            >
              {pageSlice.map((m) => (
                <ShopTile
                  key={m.uuid}
                  match={m}
                  priceState={resolvePriceState(m, prices)}
                  purseCp={purseCp}
                  buying={pending.has(m.uuid)}
                  onOpen={(): void => {
                    setSelectedMatch(m);
                  }}
                  onBuy={(unitPriceCp): Promise<void> => onBuy({ match: m, unitPriceCp })}
                />
              ))}
            </ul>
            {selectedMatch && (
              <ShopItemDetail
                match={selectedMatch}
                purseCp={purseCp}
                buying={pending.has(selectedMatch.uuid)}
                onBuy={async (unitPriceCp): Promise<void> => {
                  await onBuy({ match: selectedMatch, unitPriceCp });
                  setSelectedMatch(null);
                }}
                onClose={(): void => {
                  setSelectedMatch(null);
                }}
              />
            )}
          </div>
          {pageCount > 1 && (
            <div className="flex justify-end" data-role="pagination" data-position="bottom">
              <PaginationControls
                page={clampedPage}
                pageCount={pageCount}
                onPageChange={setPage}
                capHit={matches.length >= SEARCH_LIMIT}
                capLimit={SEARCH_LIMIT}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Compact Prev / N / M / Next strip. No result-count text — the grid
// density already communicates scale, and omitting it lets the whole
// control strip live inline with the filters.
function PaginationControls({
  page,
  pageCount,
  onPageChange,
  capHit,
  capLimit,
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  capHit: boolean;
  capLimit: number;
}): React.ReactElement | null {
  if (pageCount <= 1 && !capHit) return null;
  return (
    <div className="ml-auto flex items-center gap-1 text-xs text-pf-alt-dark">
      {capHit && (
        <span
          className="mr-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900"
          data-role="result-cap-hint"
          title={`Capped at ${capLimit.toString()} matches — narrow to see more`}
        >
          {capLimit.toString()}+
        </span>
      )}
      {pageCount > 1 && (
        <>
          <button
            type="button"
            disabled={page === 0}
            onClick={(): void => {
              onPageChange(page - 1);
            }}
            data-testid="pagination-prev"
            aria-label="Previous page"
            className="rounded border border-pf-border bg-white px-1.5 py-0.5 font-medium text-pf-alt-dark hover:bg-pf-bg-dark/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ←
          </button>
          <span className="px-1 font-mono tabular-nums" data-role="page-indicator">
            {(page + 1).toString()} / {pageCount.toString()}
          </span>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={(): void => {
              onPageChange(page + 1);
            }}
            data-testid="pagination-next"
            aria-label="Next page"
            className="rounded border border-pf-border bg-white px-1.5 py-0.5 font-medium text-pf-alt-dark hover:bg-pf-bg-dark/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            →
          </button>
        </>
      )}
    </div>
  );
}

type PriceState = { kind: 'loading' } | { kind: 'ready'; price: ItemPrice | null };

// Priority for the per-tile price:
//   1. `match.price` when the server embedded it (cache hit) — instant
//   2. The lazy-loaded prices Map (uncached packs)
//   3. Loading state while the prefetch is in flight
function resolvePriceState(match: CompendiumMatch, prefetched: Map<string, ItemPrice | null>): PriceState {
  if (match.price !== undefined) return { kind: 'ready', price: match.price };
  if (prefetched.has(match.uuid)) return { kind: 'ready', price: prefetched.get(match.uuid) ?? null };
  return { kind: 'loading' };
}

function ShopTile({
  match,
  priceState,
  purseCp,
  buying,
  onOpen,
  onBuy,
}: {
  match: CompendiumMatch;
  priceState: PriceState;
  purseCp: number;
  buying: boolean;
  onOpen: () => void;
  onBuy: (unitPriceCp: number) => Promise<void>;
}): React.ReactElement {
  const price = priceState.kind === 'ready' ? priceState.price : null;
  const unitPriceCp = price ? priceToCp(price) : 0;
  const priceText =
    priceState.kind === 'loading' ? '…' : price ? formatCp(unitPriceCp) : '—';
  const priceReady = priceState.kind === 'ready';
  // Free items (0 cp) remain buyable. When price data hasn't loaded
  // yet we optimistically allow hitting Buy — the real cost will be
  // enforced when the buy handler re-checks the actor's purse.
  const canAfford = !priceReady || unitPriceCp === 0 || purseCp >= unitPriceCp;

  return (
    <li
      className="flex flex-col overflow-hidden rounded border border-pf-border bg-pf-bg transition-shadow hover:cursor-pointer hover:shadow-md"
      data-item-uuid={match.uuid}
      data-affordable={canAfford ? 'true' : 'false'}
      onClick={(e): void => {
        if ((e.target as HTMLElement).closest('button, a, input')) return;
        onOpen();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e): void => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid="shop-tile"
    >
      {/* Square art with name overlay — mirrors the inventory GridTile */}
      <div className="relative aspect-square w-full overflow-hidden bg-pf-bg-dark">
        <img src={match.img} alt="" className="h-full w-full object-contain" />
        <div className="absolute inset-x-0 bottom-0 bg-black/40 px-1.5 py-1">
          <span className="line-clamp-2 block text-[10px] font-medium leading-tight text-white" title={match.name}>
            {match.name}
          </span>
        </div>
      </div>
      {/* Price + buy chip */}
      <div className="flex flex-col gap-1 border-t border-pf-border p-1.5">
        <span className="text-center font-mono text-[10px] tabular-nums text-pf-alt-dark" data-role="tile-price">
          {priceText}
        </span>
        <button
          type="button"
          onClick={(e): void => {
            e.stopPropagation();
            void onBuy(unitPriceCp);
          }}
          disabled={!canAfford || buying}
          data-testid="shop-buy"
          className={[
            'w-full rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            !canAfford
              ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
              : buying
                ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                : 'border-pf-primary bg-pf-primary text-white hover:bg-pf-primary-dark',
          ].join(' ')}
        >
          {buying ? 'Buying…' : canAfford ? 'Buy' : 'Too rich'}
        </button>
      </div>
    </li>
  );
}

function extractPriceFromDocument(doc: CompendiumDocument): ItemPrice | null {
  const sys = doc.system as { price?: unknown };
  const price = sys.price;
  if (!price || typeof price !== 'object') return null;
  const v = (price as { value?: unknown }).value;
  if (!v || typeof v !== 'object') return null;
  return price as ItemPrice;
}

// Full-document overlay anchored over the grid. Lazily fetches the
// compendium document for description + traits; when the pack is
// cached on the mcp side, the fetch is a synchronous in-memory hit.
// Dismissed via the × button, Esc, or clicking outside the panel.
function ShopItemDetail({
  match,
  purseCp,
  buying,
  onBuy,
  onClose,
}: {
  match: CompendiumMatch;
  purseCp: number;
  buying: boolean;
  onBuy: (unitPriceCp: number) => Promise<void>;
  onClose: () => void;
}): React.ReactElement {
  const [doc, setDoc] = useState<CompendiumDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Defer the "reset to loading" setStates to a microtask so React
    // doesn't treat the synchronous trio as a cascading-render
    // warning. The subsequent .then / .catch are already async.
    queueMicrotask(() => {
      if (cancelled) return;
      setDoc(null);
      setDocError(null);
      setDocLoading(true);
    });
    api
      .getCompendiumDocument(match.uuid)
      .then((result) => {
        if (cancelled) return;
        setDoc(result.document);
        setDocLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDocError(err instanceof Error ? err.message : String(err));
        setDocLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [match.uuid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Prefer `match.price` when the server embedded it (cached pack).
  // Falls back to reading from the freshly-fetched document for
  // uncached packs.
  const price = match.price ?? (doc ? extractPriceFromDocument(doc) : null);
  const unitPriceCp = price ? priceToCp(price) : 0;
  const priceText = price ? formatCp(unitPriceCp) : '—';
  const canAfford = unitPriceCp === 0 || purseCp >= unitPriceCp;
  const traits = match.traits ?? extractTraitsFromDocument(doc);
  const description = doc ? extractDescriptionFromDocument(doc) : '';
  const enriched = description.length > 0 ? enrichDescription(description) : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${match.name} details`}
      data-testid="shop-item-detail"
      onClick={(e): void => {
        // Click on the backdrop itself (not any child) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      className="absolute inset-0 z-20 flex items-start justify-center bg-black/10 p-2"
    >
      <div className="flex max-h-full w-full flex-col rounded border border-pf-border bg-pf-bg shadow-lg">
        <header className="flex items-start gap-3 border-b border-pf-border p-3">
          <img
            src={match.img}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-base font-semibold text-pf-text">{match.name}</h3>
            <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">
              {match.type}
              {typeof match.level === 'number' && ` · Level ${match.level.toString()}`}
              {priceText !== '—' && ` · ${priceText}`}
            </p>
            {traits.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {traits.slice(0, 8).map((t) => (
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
            aria-label="Close details"
            data-testid="shop-detail-close"
            className="shrink-0 rounded border border-pf-border bg-white px-2 py-0.5 text-sm text-pf-alt-dark hover:bg-pf-bg-dark/40"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3 text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2">
          {docLoading && !doc ? (
            <p className="italic text-pf-alt-dark">Loading…</p>
          ) : docError !== null ? (
            <p className="italic text-pf-primary">Couldn&apos;t load description: {docError}</p>
          ) : enriched.length > 0 ? (
            <div dangerouslySetInnerHTML={{ __html: enriched }} />
          ) : (
            <p className="italic text-pf-alt-dark">No description.</p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-pf-border p-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-pf-border bg-white px-3 py-1 text-xs text-pf-alt-dark hover:bg-pf-bg-dark/40"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!canAfford || buying}
            onClick={(): void => {
              void onBuy(unitPriceCp);
            }}
            data-testid="shop-detail-buy"
            className={[
              'rounded border px-3 py-1 text-xs font-semibold uppercase tracking-wider',
              !canAfford
                ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
                : buying
                  ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                  : 'border-pf-primary bg-pf-primary text-white hover:bg-pf-primary-dark',
            ].join(' ')}
          >
            {buying ? 'Buying…' : canAfford ? `Buy ${priceText}` : 'Too rich'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function extractDescriptionFromDocument(doc: CompendiumDocument): string {
  const sys = doc.system as { description?: { value?: unknown } };
  const v = sys.description?.value;
  return typeof v === 'string' ? v : '';
}

function extractTraitsFromDocument(doc: CompendiumDocument | null): string[] {
  if (!doc) return [];
  const raw = (doc.system as { traits?: { value?: unknown } }).traits?.value;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

// Match types vary: `match.type` may be the Foundry document type
// ('Item', 'weapon', 'armor'). When it's a generic 'Item' the server
// didn't supply the subtype, so we fall back to traits and name.
function filterMatchesByType(matches: readonly CompendiumMatch[], filter: TypeFilter): CompendiumMatch[] {
  if (filter === 'all') return [...matches];
  return matches.filter((m) => {
    const t = m.type.toLowerCase();
    if (t === filter) return true;
    const traits = (m.traits ?? []).map((s) => s.toLowerCase());
    if (traits.includes(filter)) return true;
    if (filter === 'consumable' && (traits.includes('potion') || traits.includes('scroll') || traits.includes('elixir'))) return true;
    return false;
  });
}
