import { useEffect, useState } from 'react';
import { Library } from 'lucide-react';
import type { BookEntry } from '../types';
import { CARD_HEIGHT } from './constants';

export function BookCard({
  book,
  onClick,
  showCovers,
  getCoverUrl,
}: {
  book: BookEntry;
  onClick: () => void;
  showCovers?: boolean;
  getCoverUrl?: (id: string) => string | Promise<string>;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState(false);

  useEffect(() => {
    setCoverUrl(null);
    setCoverError(false);
    if (!showCovers || !getCoverUrl) return;
    let cancelled = false;
    Promise.resolve(getCoverUrl(book.id))
      .then((url) => {
        if (!cancelled) setCoverUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCoverError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id, showCovers, getCoverUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-all hover:border-primary/60"
      style={{ height: CARD_HEIGHT }}
      title={book.title}
    >
      {/* Cover area fills the card */}
      <div className="absolute inset-0 overflow-hidden bg-muted">
        {coverUrl && !coverError ? (
          <img
            src={coverUrl}
            alt={book.title}
            loading="lazy"
            onError={() => setCoverError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
            className="transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
            <Library className="h-6 w-6 text-muted-foreground/40" />
            <span className="text-[9px] leading-tight text-muted-foreground/60">PDF</span>
          </div>
        )}
      </div>

      {/* Hover metadata overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-black/75 px-2 py-1.5 backdrop-blur-sm transition-transform group-hover:translate-y-0">
        <div className="truncate text-xs font-medium leading-tight text-white">{book.title}</div>
        {book.pageCount != null && <div className="text-[10px] text-white/70">{book.pageCount} pages</div>}
      </div>
    </button>
  );
}
