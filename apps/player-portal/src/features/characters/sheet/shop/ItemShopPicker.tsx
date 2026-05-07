import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/features/characters/api';
import type { CompendiumMatch, CompendiumSearchOptions, ItemPrice, PreparedActorItem } from '@/features/characters/types';
import { sumActorCoinsCp } from '@/_quarantine/lib/coins';
import { PickerResultList } from '@/_quarantine/picker';
import { ShopItemDetail } from './ShopItemDetail';
import { type ItemGroup, ShopTile } from './ShopTile';
import { useFitPageSize } from './useFitPageSize';
import {
  extractPriceFromDocument,
  filterMatchesByType,
  parseItemName,
  priceToCp,
  rarityChipActiveClass,
  resolvePriceState,
  sortVariants,
  type TypeFilter,
} from './shop-utils';

export interface BuyRequest {
  match: CompendiumMatch;
  unitPriceCp: number;
}

interface Props {
  items: readonly PreparedActorItem[];
  onBuy: (req: BuyRequest) => Promise<void>;
  pending: Set<string>;
  disabledRarities?: readonly string[];
}

const EQUIPMENT_PACKS: readonly { id: string; label: string }[] = [
  { id: 'pf2e.equipment-srd', label: 'Equipment' },
];

const RARITY_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'common',   label: 'Common'   },
  { id: 'uncommon', label: 'Uncommon' },
  { id: 'rare',     label: 'Rare'     },
  { id: 'unique',   label: 'Unique'   },
];

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all',        label: 'All'        },
  { id: 'weapon',     label: 'Weapons'    },
  { id: 'armor',      label: 'Armor'      },
  { id: 'consumable', label: 'Consumables'},
  { id: 'equipment',  label: 'Equipment'  },
  { id: 'backpack',   label: 'Containers' },
];

const DEBOUNCE_MS = 220;
// Server cap is 10k; one round-trip fits every item in the largest pf2e
// pack (~5.6k). In-memory filter/sort on hits is microseconds.
const SEARCH_LIMIT = 10_000;

export function ItemShopPicker({ items, onBuy, pending, disabledRarities }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [maxLevel, setMaxLevel] = useState<number | ''>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<Set<string>>(new Set());
  const [packId, setPackId] = useState<string>(EQUIPMENT_PACKS[0]?.id ?? '');
  const [matches, setMatches] = useState<CompendiumMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState<Map<string, ItemPrice | null>>(new Map());
  const [selectedGroup, setSelectedGroup] = useState<ItemGroup | null>(null);

  const purseCp = useMemo(() => sumActorCoinsCp(items), [items]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return (): void => {
      window.clearTimeout(t);
    };
  }, [query]);

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
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [debouncedQuery, maxLevel, packId]);

  const filtered = useMemo(() => {
    const typed = filterMatchesByType(matches, typeFilter);
    const priceFiltered = typed.filter((m) => m.price === undefined || priceToCp(m.price) > 0);
    const disabledSet = new Set(disabledRarities?.map((r) => r.toLowerCase()) ?? []);
    const availableRarities =
      disabledSet.size > 0
        ? priceFiltered.filter((m) => !disabledSet.has((m.rarity ?? 'common').toLowerCase()))
        : priceFiltered;
    const rarityFiltered =
      rarityFilter.size === 0
        ? availableRarities
        : availableRarities.filter((m) => rarityFilter.has((m.rarity ?? 'common').toLowerCase()));

    const groupMap = new Map<string, CompendiumMatch[]>();
    for (const m of rarityFiltered) {
      const key = parseItemName(m.name).base.toLowerCase();
      const arr = groupMap.get(key);
      if (arr) arr.push(m);
      else groupMap.set(key, [m]);
    }

    const groups: ItemGroup[] = [];
    for (const [key, variants] of groupMap) {
      const sorted = sortVariants(variants);
      const displayName = parseItemName(sorted[0]?.name ?? '').base;
      groups.push({ key, displayName, variants: sorted });
    }
    groups.sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  }, [matches, typeFilter, rarityFilter, disabledRarities]);

  const { pageSize, maxHeight, gridRef } = useFitPageSize();
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageStart = clampedPage * pageSize;
  const pageSlice = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize],
  );

  // Reset to page 0 on any filter change (render-time comparison avoids
  // an extra render pass and the set-state-in-effect lint warning).
  const filterKey = `${debouncedQuery}|${maxLevel.toString()}|${packId}|${typeFilter}|${[...rarityFilter].sort().join(',')}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(0);
  }

  // Price prefetch: scoped to the current page so uncached packs don't
  // fire thousands of fetches up-front. Cached packs embed price on the
  // match, so this loop short-circuits in the common case.
  const pageVariants = useMemo(() => pageSlice.flatMap((g) => g.variants), [pageSlice]);
  useEffect(() => {
    const needed = pageVariants.filter((m) => m.price === undefined && !prices.has(m.uuid));
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
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (cancelled) return;
          setPrices((prev) => {
            if (prev.has(m.uuid)) return prev;
            const next = new Map(prev);
            next.set(m.uuid, extractPriceFromDocument(document));
            return next;
          });
        } catch {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
  }, [pageVariants, prices]);

  const emptyResults = filtered.length === 0;

  return (
    <div className="space-y-2" data-section="shop-picker">
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
        <ul className="flex items-center gap-1" role="group" aria-label="Rarity filter">
          {RARITY_FILTERS.filter((rf) => !disabledRarities?.includes(rf.id)).map((rf) => {
            const active = rarityFilter.has(rf.id);
            return (
              <li key={rf.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={(): void => {
                    setRarityFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(rf.id)) next.delete(rf.id);
                      else next.add(rf.id);
                      return next;
                    });
                  }}
                  className={[
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider',
                    active
                      ? rarityChipActiveClass(rf.id)
                      : 'border-pf-border bg-white text-pf-alt-dark hover:bg-pf-bg-dark/40',
                  ].join(' ')}
                >
                  {rf.label}
                </button>
              </li>
            );
          })}
        </ul>
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
        <div className="relative">
          <PickerResultList
            items={pageSlice}
            renderList={(slice) => (
              <ul
                ref={gridRef}
                className="grid gap-2 overflow-hidden"
                style={{
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  maxHeight: maxHeight !== null ? `${maxHeight.toString()}px` : 'calc(100dvh - 20rem)',
                }}
                data-testid="shop-grid"
              >
                {slice.map((g) => (
                  <ShopTile
                    key={g.key}
                    group={g}
                    priceState={resolvePriceState(g.variants[0] as CompendiumMatch, prices)}
                    purseCp={purseCp}
                    buying={g.variants.some((v) => pending.has(v.uuid))}
                    onOpen={(): void => {
                      setSelectedGroup(g);
                    }}
                    onBuyDirect={(unitPriceCp): Promise<void> =>
                      onBuy({ match: g.variants[0] as CompendiumMatch, unitPriceCp })
                    }
                  />
                ))}
              </ul>
            )}
          />
          {selectedGroup && (
            <ShopItemDetail
              group={selectedGroup}
              purseCp={purseCp}
              pending={pending}
              onBuy={async (match, unitPriceCp): Promise<void> => {
                await onBuy({ match, unitPriceCp });
                setSelectedGroup(null);
              }}
              onClose={(): void => {
                setSelectedGroup(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pagination controls ─────────────────────────────────────────────────

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
