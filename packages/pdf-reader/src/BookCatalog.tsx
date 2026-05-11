import { useEffect, useMemo, useRef, useState } from 'react';
import { Library } from 'lucide-react';
import { CatalogGrid } from './catalog/CatalogGrid';
import { cn } from './lib/cn';
import type { BookCatalogProps } from './types';

export function BookCatalog({
  books,
  onSelect,
  showCovers,
  getCoverUrl,
  emptyMessage = 'No books found.',
  loading = false,
  defaultCategory,
}: BookCatalogProps) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Unique categories with counts. PF2e-prefixed categories sort first
  // (this toolkit's primary system), the rest alphabetically.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      if (b.category) counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const aPf = a.name.startsWith('PF2e');
        const bPf = b.name.startsWith('PF2e');
        if (aPf !== bPf) return aPf ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [books]);

  // Apply defaultCategory once on the first non-empty render of books.
  // After that the user owns the selection, even if they choose "All".
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || books.length === 0 || !defaultCategory) return;
    initializedRef.current = true;
    if (books.some((b) => b.category === defaultCategory)) {
      setSelectedCategory(defaultCategory);
    }
  }, [books, defaultCategory]);

  // Drop the category filter if the selection no longer exists.
  if (selectedCategory && !categories.some((c) => c.name === selectedCategory)) {
    setSelectedCategory(null);
  }

  const filtered = useMemo(() => {
    let result = books;
    if (selectedCategory) {
      result = result.filter((b) => b.category === selectedCategory);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((b) => b.title.toLowerCase().includes(q));
    }
    return result;
  }, [books, query, selectedCategory]);

  const showSidebar = categories.length > 1;

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

      <div className="flex min-h-0 flex-1">
        {/* Filter sidebar */}
        {showSidebar && (
          <div className="w-56 shrink-0 overflow-auto border-r border-border bg-muted/20 p-2">
            <div className="flex flex-col gap-1">
              <CategoryPill
                label="All"
                count={books.length}
                active={selectedCategory === null}
                onClick={() => setSelectedCategory(null)}
              />
              {categories.map((c) => (
                <CategoryPill
                  key={c.name}
                  label={c.name}
                  count={c.count}
                  active={selectedCategory === c.name}
                  onClick={() => setSelectedCategory(c.name === selectedCategory ? null : c.name)}
                />
              ))}
            </div>
          </div>
        )}

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
    </div>
  );
}

function CategoryPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cn('ml-2 shrink-0 tabular-nums text-[10px]', active ? 'opacity-80' : 'opacity-60')}>
        {count}
      </span>
    </button>
  );
}
