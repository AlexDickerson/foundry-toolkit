import { useMemo, useState } from 'react';
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
}: BookCatalogProps) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Unique categories with counts, sorted alphabetically. Used as filter pills.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      if (b.category) counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [books]);

  // Drop the category filter if the selection no longer exists (e.g. after the
  // books prop changes) so the catalog doesn't silently show nothing.
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

      {/* Category filter pills */}
      {categories.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-3 py-2">
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
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground',
      )}
    >
      <span>{label}</span>
      <span className={cn('tabular-nums text-[10px]', active ? 'opacity-80' : 'opacity-60')}>{count}</span>
    </button>
  );
}
