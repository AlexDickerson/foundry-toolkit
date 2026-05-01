import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import type { CompendiumMatch, CompendiumSearchOptions } from '../../api/types';
import { useDebounce } from '../../lib/useDebounce';
import { usePaginatedSearch } from '../../lib/usePaginatedSearch';
import { CompendiumPicker } from '../picker';

interface Props {
  entryName: string;
  /** The entry's magic tradition (arcane / divine / occult / primal), or
   *  null for entries without a fixed tradition (e.g. some focus entries). */
  tradition: string | null;
  onPick: (match: CompendiumMatch) => void;
  onClose: () => void;
}

// Spell packs that contain standard leveled spells and cantrips.
const SPELL_PACKS: readonly string[] = ['pf2e.spells-srd'];

const TRADITION_TRAITS = new Set(['arcane', 'divine', 'occult', 'primal']);

export function SpellPicker({ entryName, tradition, onPick, onClose }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);

  const { state: searchState, hasMore, isLoadingMore, loadMore } = usePaginatedSearch<CompendiumMatch>(
    async (offset, pageSize) => {
      const opts: CompendiumSearchOptions = {
        q: debouncedQuery,
        documentType: 'Item',
        packIds: [...SPELL_PACKS],
        limit: pageSize,
        offset,
      };
      if (tradition !== null) opts.traits = [tradition];
      return api.searchCompendium(opts);
    },
    [debouncedQuery, tradition],
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

  const isLoading = searchState.kind === 'loading';
  const error = searchState.kind === 'error' ? searchState.message : null;
  const items = searchState.kind === 'ready' ? searchState.items : [];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add spell to ${entryName}`}
      data-testid="spell-picker"
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
          <div>
            <h2 className="font-serif text-lg font-semibold text-pf-text">Add Spell</h2>
            {tradition !== null && (
              <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">{tradition}</p>
            )}
          </div>
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
            data-testid="spell-picker-input"
          />
        </div>
        <CompendiumPicker
          isLoading={isLoading}
          error={error}
          items={items}
          emptyMessage="No spells found. Try a different search term."
          renderList={(matches) => (
            <ul className="grid grid-cols-1 gap-1 p-2">
              {matches.map((m) => {
                const traditionTags = m.traits?.filter((t) => TRADITION_TRAITS.has(t)) ?? [];
                return (
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
                      {traditionTags.length > 0 && (
                        <span className="flex-shrink-0 text-[10px] text-pf-alt-dark">
                          {traditionTags.join(' ')}
                        </span>
                      )}
                      {typeof m.level === 'number' && (
                        <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-widest text-pf-alt-dark">
                          Rank {m.level}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          {...(searchState.kind === 'ready'
            ? { remainingCount: searchState.total - searchState.items.length }
            : {})}
          loadMoreTestId="spell-picker-load-more"
          resultsTestId="spell-picker-results"
        />
      </div>
    </div>,
    document.body,
  );
}
