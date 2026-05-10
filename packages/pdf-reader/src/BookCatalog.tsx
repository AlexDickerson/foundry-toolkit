import { useMemo, useState } from 'react';
import { Library } from 'lucide-react';
import { CatalogGrid } from './catalog/CatalogGrid';
import type { BookCatalogProps } from './types';

export function BookCatalog({
  books,
  onSelect,
  showCovers,
  getCoverUrl,
  emptyMessage = 'No books found.',
  loading = false,
}: BookCatalogProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.title.toLowerCase().includes(q));
  }, [books, query]);

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <input
          type="search"
          placeholder="Search books…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {/* Grid or empty state */}
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Library className="h-8 w-8 opacity-50" />
            <span className="text-sm">{emptyMessage}</span>
          </div>
        ) : (
          <CatalogGrid
            books={filtered}
            onSelect={onSelect}
            {...(showCovers !== undefined && { showCovers })}
            {...(getCoverUrl !== undefined && { getCoverUrl })}
          />
        )}
      </div>
    </div>
  );
}
