import { Info, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { MonsterDetail } from '@foundry-toolkit/shared/types';
import { CreatureDetailPane } from '../creatures/CreatureDetailPane';

const RARITY_BADGE: Record<string, string> = {
  common: 'bg-zinc-600 text-zinc-100',
  uncommon: 'bg-amber-700 text-amber-100',
  rare: 'bg-blue-700 text-blue-100',
  unique: 'bg-purple-700 text-purple-100',
};

interface Props {
  detail: MonsterDetail;
  loading: boolean;
  onOpenExternal: (url: string) => void;
  onClose: () => void;
}

export function MonsterDetailPane({ detail, loading, onOpenExternal, onClose }: Props) {
  const [loreOpen, setLoreOpen] = useState(false);

  return (
    <>
      {/* Header: identity chrome — name, badges, traits, lore toggle, close */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="shrink-0 text-sm font-semibold">{detail.name}</h2>
        <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
          Lvl {detail.level}
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize',
            RARITY_BADGE[detail.rarity.toLowerCase()] ?? 'bg-zinc-600 text-zinc-100',
          )}
        >
          {detail.rarity}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize">{detail.size}</span>
        {detail.traits.map((t) => (
          <span key={t} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] capitalize">
            {t}
          </span>
        ))}
        <div className="flex-1" />
        {detail.description && (
          <button
            type="button"
            aria-label="Show lore"
            onMouseEnter={() => setLoreOpen(true)}
            onMouseLeave={() => setLoreOpen(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <CreatureDetailPane detail={detail} onOpenExternal={onOpenExternal} />

          {/* Lore overlay — covers the content area on info-button hover */}
          {loreOpen && detail.description && (
            <div
              className="absolute inset-0 z-10 overflow-y-auto bg-background/50 px-5 py-4 backdrop-blur-sm"
              onMouseEnter={() => setLoreOpen(true)}
              onMouseLeave={() => setLoreOpen(false)}
            >
              <p className="text-xs leading-relaxed text-foreground/90">{detail.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Source label — pinned to bottom */}
      {!loading && (
        <div className="flex shrink-0 items-center border-t border-border px-4 py-1.5">
          <span className="text-[11px] text-muted-foreground">{detail.source}</span>
        </div>
      )}
    </>
  );
}
