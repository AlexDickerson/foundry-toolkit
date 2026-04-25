import { ExternalLink, Sparkles, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useItemDetail } from './useItems';
import { formatItemType, formatUsage } from './item-display-helpers';
import type { ItemBrowserRow } from '@foundry-toolkit/shared/types';

interface ItemDetailPaneProps {
  itemId: string | null;
  siblings?: ItemBrowserRow[] | null;
  onSelectSibling?: (id: string) => void;
  onClose: () => void;
}

const RARITY_CHIP: Record<string, string> = {
  COMMON: 'bg-muted text-foreground border-border',
  UNCOMMON: 'bg-orange-900/40 text-orange-300 border-orange-700/40',
  RARE: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  UNIQUE: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
};

export function ItemDetailPane({ itemId, siblings, onSelectSibling, onClose }: ItemDetailPaneProps) {
  const { data: detail, loading, error } = useItemDetail(itemId);

  if (!itemId) return null;

  return (
    <>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{detail?.name ?? 'Loading...'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Separator />

      {loading && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>
      )}
      {error && <div className="p-3 text-sm text-destructive">{error}</div>}
      {detail && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4">
            {/* Stacked metadata (left) + icon (right) */}
            <div className="flex items-start gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {detail.level != null ? `Level ${detail.level}` : 'Level —'}
                  </span>
                  {detail.itemType && (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {formatItemType(detail.itemType)}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'self-start rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize leading-none',
                    RARITY_CHIP[detail.rarity] || RARITY_CHIP.COMMON,
                  )}
                >
                  {detail.rarity.toLowerCase()}
                </span>
                {detail.isMagical && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                    <Sparkles className="h-3 w-3" />
                    Magical
                  </span>
                )}
                {detail.isRemastered === false && (
                  <span className="self-start rounded border border-yellow-700/40 bg-yellow-950/30 px-1.5 py-0.5 text-[10px] font-medium leading-none text-yellow-400">
                    Legacy
                  </span>
                )}
              </div>
              {detail.img && (
                <img
                  src={detail.img}
                  alt=""
                  className="h-24 w-24 shrink-0 rounded-md object-contain"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>

            <Separator />

            {/* Stats — single-column, label left / value right */}
            <div className="space-y-1.5 text-xs">
              <StatRow label="Price" value={detail.price ?? '—'} />
              <StatRow label="Bulk" value={detail.bulk ?? '—'} />
              {detail.usage && <StatRow label="Usage" value={formatUsage(detail.usage) ?? detail.usage} />}
              {detail.hasActivation && <StatRow label="Activation" value="activatable" />}
              {detail.source && <StatRow label="Source" value={detail.source} />}
            </div>

            {/* Grade variants (siblings from grouping) */}
            {siblings && siblings.length > 1 && (
              <>
                <Separator />
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Grades
                  </h3>
                  <div className="space-y-0.5">
                    {siblings.map((s) => {
                      const isCurrent = s.id === itemId;
                      const match = s.name.match(/\(([^)]+)\)\s*$/);
                      const label = match ? match[1] : s.name;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => !isCurrent && onSelectSibling?.(s.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors',
                            isCurrent
                              ? 'bg-primary/15 text-foreground'
                              : 'bg-accent/30 text-foreground/80 hover:bg-accent/60',
                          )}
                        >
                          <span className="min-w-0 truncate font-medium">{label}</span>
                          <div className="flex shrink-0 gap-3 tabular-nums text-muted-foreground">
                            {s.level != null && <span>Lv {s.level}</span>}
                            {s.price && <span>{s.price}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Variants (from item's own variant data — shown only when there are no grade siblings) */}
            {detail.variants.length > 0 && !(siblings && siblings.length > 1) && (
              <>
                <Separator />
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Variants
                  </h3>
                  <div className="space-y-1">
                    {detail.variants.map((v, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-accent/30 px-2 py-1 text-xs">
                        <span className="min-w-0 truncate">{v.type}</span>
                        <div className="flex shrink-0 gap-3 text-muted-foreground">
                          {v.level != null && <span>Lv {v.level}</span>}
                          {v.price && <span>{v.price}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Description — already plain text from the projection layer.
                `---` lines are rendered as visual section dividers. */}
            {detail.description && (
              <>
                <Separator />
                <div className="space-y-2 text-xs leading-relaxed text-foreground/90">
                  {detail.description.split('\n').map((line, i) => {
                    const t = line.trim();
                    if (t === '---') return <Separator key={i} />;
                    if (!t) return null;
                    return <p key={i}>{t}</p>;
                  })}
                </div>
              </>
            )}

            {/* AoN link */}
            {detail.aonUrl && (
              <>
                <Separator />
                <button
                  type="button"
                  onClick={() => api.openExternal(detail.aonUrl!)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on Archives of Nethys
                </button>
              </>
            )}

            {/* Traits */}
            {detail.traits.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-1">
                  {detail.traits.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-border bg-accent/60 px-1.5 py-0.5 text-[10px] leading-none text-foreground/80"
                    >
                      {t.toLowerCase()}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
