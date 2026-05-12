import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BookCard } from './BookCard';
import { CARD_HEIGHT, CARD_WIDTH, GAP, SECTION_HEIGHT } from './constants';
import type { BookEntry } from '../types';

type LayoutRow = { kind: 'section'; label: string } | { kind: 'cards'; items: BookEntry[] };

/** Virtualized grid of book cards with optional section headers derived from
 *  book.category. A section header appears whenever category changes as the
 *  list is iterated in order, so pass pre-sorted books for deterministic
 *  grouping. */
export function CatalogGrid({
  books,
  onSelect,
  showCovers,
  getCoverUrl,
}: {
  books: BookEntry[];
  onSelect: (book: BookEntry) => void;
  showCovers?: boolean;
  getCoverUrl?: (id: string) => string | Promise<string>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setColumnCount(Math.max(1, Math.floor((el.clientWidth + GAP) / (CARD_WIDTH + GAP))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutRows = useMemo((): LayoutRow[] => {
    const rows: LayoutRow[] = [];
    const cardBuffer: BookEntry[] = [];
    let lastCategory: string | undefined;

    const flushCards = () => {
      while (cardBuffer.length > 0) {
        rows.push({ kind: 'cards', items: cardBuffer.splice(0, columnCount) });
      }
    };

    for (const book of books) {
      if (book.category && book.category !== lastCategory) {
        flushCards();
        rows.push({ kind: 'section', label: book.category });
        lastCategory = book.category;
      }
      cardBuffer.push(book);
    }
    flushCards();
    return rows;
  }, [books, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: layoutRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (layoutRows[i]?.kind === 'section' ? SECTION_HEIGHT : CARD_HEIGHT + GAP),
    overscan: 3,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div ref={parentRef} className="h-full overflow-auto p-3">
      <div style={{ height: totalSize, position: 'relative' }}>
        {virtualItems.map((vRow) => {
          const row = layoutRows[vRow.index];
          if (!row) return null;

          if (row.kind === 'section') {
            return (
              <div
                key={vRow.key}
                className="absolute left-0 right-0 flex items-end"
                style={{ height: SECTION_HEIGHT, transform: `translateY(${vRow.start}px)` }}
              >
                <div className="flex w-full items-center gap-3 pb-1">
                  <span className="text-xs tracking-wide text-muted-foreground">{row.label}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            );
          }

          return (
            <div
              key={vRow.key}
              className="absolute left-0 right-0 grid"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: `${GAP}px`,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              {row.items.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onClick={() => onSelect(book)}
                  {...(showCovers !== undefined && { showCovers })}
                  {...(getCoverUrl !== undefined && { getCoverUrl })}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
