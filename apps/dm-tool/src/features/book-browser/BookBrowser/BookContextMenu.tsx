import { useEffect, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Book } from '@foundry-toolkit/shared/types';
import { effectiveCategory, effectiveSystem } from './helpers';

// Right-click menu's category / system options. Narrower than the
// sidebar's CATEGORY_ORDER — only the buckets a user would consciously
// re-classify a book into.
const CTX_CATEGORIES = ['Rulebook', 'Adventure Path', 'Adventure', 'Setting', 'Supplement'] as const;
const CTX_SYSTEMS = ['PF2e', '5e', 'Generic'] as const;

export function BookContextMenu({
  book,
  x,
  y,
  onClose,
  onUpdateMeta,
}: {
  book: Book;
  x: number;
  y: number;
  onClose: () => void;
  onUpdateMeta: (bookId: number, fields: { aiSystem?: string; aiCategory?: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position so menu doesn't overflow viewport.
  const style = useMemo(() => {
    const menuW = 180;
    const menuH = 280;
    const left = Math.min(x, window.innerWidth - menuW - 8);
    const top = Math.min(y, window.innerHeight - menuH - 8);
    return { position: 'fixed' as const, left, top, zIndex: 9999 };
  }, [x, y]);

  const curCat = effectiveCategory(book);
  const curSys = effectiveSystem(book);

  return (
    <div
      ref={ref}
      style={{ ...style, backgroundColor: 'hsl(var(--popover))' }}
      className="min-w-[160px] rounded-md border border-border py-1 shadow-lg"
    >
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</div>
      {CTX_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent',
            curCat === cat && 'text-foreground font-medium',
            curCat !== cat && 'text-muted-foreground',
          )}
          onClick={() => {
            onUpdateMeta(book.id, { aiCategory: cat });
            onClose();
          }}
        >
          <Check className={cn('h-3 w-3', curCat === cat ? 'opacity-100' : 'opacity-0')} />
          {cat}
        </button>
      ))}
      <div className="mx-2 my-1 h-px bg-border" />
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System</div>
      {CTX_SYSTEMS.map((sys) => (
        <button
          key={sys}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent',
            curSys === sys && 'text-foreground font-medium',
            curSys !== sys && 'text-muted-foreground',
          )}
          onClick={() => {
            onUpdateMeta(book.id, { aiSystem: sys });
            onClose();
          }}
        >
          <Check className={cn('h-3 w-3', curSys === sys ? 'opacity-100' : 'opacity-0')} />
          {sys}
        </button>
      ))}
    </div>
  );
}
