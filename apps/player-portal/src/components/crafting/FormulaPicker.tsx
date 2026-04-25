import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { CompendiumMatch } from '../../api/types';
import { useDebounce } from '../../lib/useDebounce';
import { usePaginatedSearch } from '../../lib/usePaginatedSearch';

interface Props {
  /** Uuids that are already in the formula book — filtered out of
   *  results so the picker never offers a duplicate. */
  alreadyKnown: ReadonlySet<string>;
  /** Called when the user picks a match. Parent owns the add call +
   *  any optimistic UI. Close-on-pick is the parent's job too. */
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}

// Dedicated formula picker. Searches pf2e physical-item packs by free
// text; filters to items with a declared max level so it skips the
// ~thousand treasure entries that don't have a craftable recipe in
// practice. Deliberately narrower than the `ItemShopPicker` (which
// carries buy/sell buttons + coin math) since crafting just needs a
// uuid to hand off to the bridge.
export function FormulaPicker({ alreadyKnown, onPick, onClose }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Search is gated on the query being at least 2 characters. We pass a
  // stable `enabled` flag into the fetcher — when false it short-circuits
  // to an empty result so `usePaginatedSearch` doesn't fire a real request.
  const searchEnabled = debounced.trim().length >= 2;

  const {
    state: searchState,
    hasMore,
    isLoadingMore,
    loadMore,
  } = usePaginatedSearch<CompendiumMatch>(
    async (offset, pageSize) => {
      if (!searchEnabled) return { matches: [], total: 0 };
      return api.searchCompendium({
        q: debounced,
        documentType: 'Item',
        // Copy to a mutable array — `CompendiumSearchOptions.packIds`
        // is typed `string[]`, not `readonly string[]`.
        packIds: [...PHYSICAL_ITEM_PACKS],
        limit: pageSize,
        offset,
      });
    },
    [debounced],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Trap Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Filter out already-known items client-side on top of the server results.
  // `allMatches` is memoised to produce a stable reference when the search
  // state hasn't changed, preventing useMemo from seeing new array identity
  // on every render when the search is in the loading/error state.
  const allMatches = useMemo(
    () => (searchState.kind === 'ready' ? searchState.items : []),
    [searchState],
  );
  const filtered = useMemo(() => allMatches.filter((m) => !alreadyKnown.has(m.uuid)), [allMatches, alreadyKnown]);

  const isSearching = searchEnabled && searchState.kind === 'loading';
  const searchError = searchState.kind === 'error' ? searchState.message : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 sm:p-8"
      onClick={(e) => {
        // Backdrop click closes; click inside the dialog shouldn't.
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add formula"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded border border-pf-primary/60 bg-pf-bg shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-pf-border px-4 py-2">
          <h2 className="font-serif text-base font-semibold uppercase tracking-wide text-pf-alt-dark">Add Formula</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </header>
        <div className="border-b border-pf-border px-4 py-2">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Search equipment by name (min 2 characters)…"
            className="w-full rounded border border-pf-border bg-white px-2 py-1 text-sm text-pf-text focus:border-pf-primary focus:outline-none"
          />
        </div>
        <div className="min-h-[4rem] flex-1 overflow-y-auto p-2">
          {isSearching && <p className="p-2 text-sm italic text-neutral-400">Searching…</p>}
          {searchError !== null && (
            <p className="p-2 text-sm text-red-700">Search failed: {searchError}</p>
          )}
          {!searchEnabled && (
            <p className="p-2 text-xs italic text-neutral-400">Type to search the equipment compendium.</p>
          )}
          {searchEnabled && !isSearching && searchError === null && filtered.length === 0 && allMatches.length > 0 && (
            <p className="p-2 text-xs italic text-neutral-400">Every match is already in the book.</p>
          )}
          {searchEnabled && !isSearching && searchError === null && allMatches.length === 0 && (
            <p className="p-2 text-xs italic text-neutral-400">No matches.</p>
          )}
          {filtered.length > 0 && (
            <ul className="grid grid-cols-1 gap-1">
              {filtered.map((m) => (
                <li key={m.uuid}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(m);
                    }}
                    className="flex w-full items-center gap-2 rounded border border-transparent px-2 py-1 text-left hover:border-pf-primary/60 hover:bg-pf-bg-dark/40"
                    data-pick-uuid={m.uuid}
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
              ))}
            </ul>
          )}
          {(hasMore || isLoadingMore) && (
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                data-testid="formula-picker-load-more"
                className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-800 disabled:cursor-wait disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Equipment packs pf2e ships in its SRD. Keeping the list narrow
// prevents searches from pulling bestiary/feat packs; widen when
// real use cases surface.
const PHYSICAL_ITEM_PACKS: readonly string[] = [
  'pf2e.equipment-srd',
  'pf2e.adventure-specific-items',
];
