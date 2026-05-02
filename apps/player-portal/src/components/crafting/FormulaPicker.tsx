import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import type { CompendiumMatch } from '../../api/types';
import { useDebounce } from '../../lib/useDebounce';
import { usePaginatedSearch } from '../../lib/usePaginatedSearch';
import { CompendiumPicker } from '../picker';

interface Props {
  /** Uuids that are already in the formula book — filtered out of
   *  results so the picker never offers a duplicate. */
  alreadyKnown: ReadonlySet<string>;
  /** Called when the user picks a match. Parent owns the add call +
   *  any optimistic UI. Close-on-pick is the parent's job too. */
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}

// Equipment packs pf2e ships in its SRD. Keeping the list narrow
// prevents searches from pulling bestiary/feat packs; widen when
// real use cases surface.
const PHYSICAL_ITEM_PACKS: readonly string[] = [
  'pf2e.equipment-srd',
  'pf2e.adventure-specific-items',
];

export function FormulaPicker({ alreadyKnown, onPick, onClose }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    state: searchState,
    hasMore,
    isLoadingMore,
    loadMore,
  } = usePaginatedSearch<CompendiumMatch>(
    async (offset, pageSize) =>
      api.searchCompendium({
        q: debounced,
        documentType: 'Item',
        packIds: [...PHYSICAL_ITEM_PACKS],
        limit: pageSize,
        offset,
      }),
    [debounced],
  );

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

  // Filter out already-known items client-side on top of server results.
  const allMatches = useMemo(
    () => (searchState.kind === 'ready' ? searchState.items : []),
    [searchState],
  );
  const filtered = useMemo(
    () => allMatches.filter((m) => !alreadyKnown.has(m.uuid)),
    [allMatches, alreadyKnown],
  );

  const isLoading = searchState.kind === 'loading';
  const error = searchState.kind === 'error' ? searchState.message : null;
  const emptyMessage = allMatches.length > 0 ? 'Every match is already in the book.' : 'No matches.';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add formula"
      data-testid="formula-picker"
      className="fixed inset-0 z-50 flex items-start justify-center bg-pf-text/50 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded border border-pf-border bg-pf-bg shadow-xl"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between border-b border-pf-border px-4 py-2">
          <h2 className="font-serif text-lg font-semibold text-pf-text">Add Formula</h2>
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
            placeholder="Filter by name…"
            className="w-full rounded border border-pf-border bg-pf-bg px-2 py-1 text-sm text-pf-text placeholder:text-pf-alt focus:border-pf-primary focus:outline-none"
            data-testid="formula-picker-input"
          />
        </div>
        <CompendiumPicker
          isLoading={isLoading}
          error={error}
          items={filtered}
          emptyMessage={emptyMessage}
          renderList={(items) => (
            <ul className="grid grid-cols-1 gap-1 p-2">
              {items.map((m) => (
                <li key={m.uuid}>
                  <button
                    type="button"
                    onClick={(): void => {
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
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          {...(searchState.kind === 'ready'
            ? { remainingCount: searchState.total - searchState.items.length }
            : {})}
          loadMoreTestId="formula-picker-load-more"
          resultsTestId="formula-picker-results"
        />
      </div>
    </div>,
    document.body,
  );
}
