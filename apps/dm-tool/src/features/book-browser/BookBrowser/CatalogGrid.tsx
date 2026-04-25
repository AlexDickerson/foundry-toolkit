import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Book } from '@foundry-toolkit/shared/types';
import { ApCard, BookCard } from './cards';
import { CARD_HEIGHT, CARD_WIDTH, GAP, SECTION_HEIGHT } from './constants';
import type { CatalogEntry } from './types';

/** A layout row is either a section header (full width) or a row of cards. */
type LayoutRow = { kind: 'section'; label: string } | { kind: 'cards'; items: CatalogEntry[] };

export function CatalogGrid({
  entries,
  onSelect,
  onBookContextMenu,
}: {
  entries: CatalogEntry[];
  onSelect: (e: CatalogEntry) => void;
  onBookContextMenu?: (e: React.MouseEvent, book: Book) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setColumnCount(Math.max(1, Math.floor((w + GAP) / (CARD_WIDTH + GAP))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build layout rows: section headers get their own row, card entries
  // are chunked into rows of `columnCount`.
  const layoutRows = useMemo((): LayoutRow[] => {
    const rows: LayoutRow[] = [];
    const cardBuffer: CatalogEntry[] = [];

    const flushCards = () => {
      while (cardBuffer.length > 0) {
        rows.push({ kind: 'cards', items: cardBuffer.splice(0, columnCount) });
      }
    };

    for (const entry of entries) {
      if (entry.kind === 'section') {
        flushCards();
        rows.push({ kind: 'section', label: entry.label });
      } else {
        cardBuffer.push(entry);
      }
    }
    flushCards();
    return rows;
  }, [entries, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: layoutRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (layoutRows[i]?.kind === 'section' ? SECTION_HEIGHT : CARD_HEIGHT + GAP),
    overscan: 3,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      gap: `${GAP}px`,
    }),
    [columnCount],
  );

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
                style={{
                  height: SECTION_HEIGHT,
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                <div className="flex w-full items-center gap-3 pb-1">
                  <span
                    className="text-xs tracking-wide text-muted-foreground"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                  >
                    {row.label}
                  </span>
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
                ...gridStyle,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              {row.items.map((entry) =>
                entry.kind === 'ap' ? (
                  <ApCard key={`ap-${entry.group.subcategory}`} group={entry.group} onClick={() => onSelect(entry)} />
                ) : entry.kind === 'book' ? (
                  <BookCard
                    key={entry.book.id}
                    book={entry.book}
                    onClick={() => onSelect(entry)}
                    onContextMenu={onBookContextMenu}
                  />
                ) : null,
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
