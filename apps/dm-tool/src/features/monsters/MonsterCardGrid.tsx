import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { MONSTER_CARD_SIZE } from '@/lib/constants';
import type { MonsterSummary } from '@foundry-toolkit/shared/types';

const CARD_ASPECT = 200 / 108;
const GAP = 8;

const RARITY_BORDER: Record<string, string> = {
  common: 'border-l-zinc-500',
  uncommon: 'border-l-amber-500',
  rare: 'border-l-blue-500',
  unique: 'border-l-purple-500',
};

interface Props {
  monsters: MonsterSummary[];
  error: string | null;
  selected: string | null;
  onSelect: (name: string) => void;
  cardSize?: number;
}

export function MonsterCardGrid({ monsters, error, selected, onSelect, cardSize }: Props) {
  const cardW = cardSize ?? MONSTER_CARD_SIZE.default;
  const cardH = Math.round(cardW * CARD_ASPECT);

  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(4);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setColumnCount(Math.max(1, Math.floor((w + GAP) / (cardW + GAP))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cardW]);

  const rowCount = Math.ceil(monsters.length / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => cardH + GAP,
    overscan: 5,
  });

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      gap: GAP,
      padding: `0 ${GAP}px`,
    }),
    [columnCount],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {error && <div className="px-3 py-2 text-xs text-destructive">{error}</div>}

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto" style={{ paddingTop: GAP }}>
        {monsters.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No monsters match your filters
          </div>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const startIdx = vRow.index * columnCount;
              const rowItems = monsters.slice(startIdx, startIdx + columnCount);
              return (
                <div
                  key={vRow.key}
                  className="absolute left-0 right-0"
                  style={{ ...gridStyle, transform: `translateY(${vRow.start}px)` }}
                >
                  {rowItems.map((m) => {
                    const isSelected = m.name === selected;
                    return (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => onSelect(m.name)}
                        className={cn(
                          'relative overflow-hidden rounded-md border border-l-[3px] text-left text-xs transition-colors',
                          RARITY_BORDER[m.rarity.toLowerCase()] ?? 'border-l-border',
                          isSelected ? 'border-primary/50' : 'border-border',
                        )}
                        style={{ height: cardH }}
                      >
                        {/* Token art — full-card background */}
                        {m.tokenUrl && (
                          <img src={m.tokenUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
                        )}

                        {/* Content — sits above the art */}
                        <div className="relative flex h-full flex-col justify-between p-2">
                          {/* Name + level */}
                          <div className="flex items-start justify-between gap-1">
                            <span className="min-w-0 font-medium leading-tight drop-shadow-sm">{m.name}</span>
                            <span className="shrink-0 rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none">
                              {m.level}
                            </span>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-2 text-[10px] tabular-nums">
                            <span className="rounded bg-muted/80 px-1 py-0.5">
                              <b>HP</b> {m.hp}
                            </span>
                            <span className="rounded bg-muted/80 px-1 py-0.5">
                              <b>AC</b> {m.ac}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex h-7 shrink-0 items-center px-3">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {monsters.length.toLocaleString()} creature{monsters.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
