import { useEffect, useState } from 'react';
import { Layers, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Book } from '@foundry-toolkit/shared/types';
import { apTotalPages, type ApGroup } from '../ap-merge';
import { CARD_HEIGHT } from './constants';
import { effectiveTitle } from './helpers';

export function BookCard({
  book,
  onClick,
  onContextMenu,
}: {
  book: Book;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent, book: Book) => void;
}) {
  const [coverError, setCoverError] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    setCoverError(false);
    setCoverUrl(null);
    if (book.ingested) {
      api
        .booksGetCoverUrl(book.id)
        .then(setCoverUrl)
        .catch((err) => {
          console.error(`Failed to load cover for book ${book.id}:`, err);
          setCoverError(true);
        });
    }
  }, [book.id, book.ingested]);

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, book) : undefined}
      className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-all hover:border-primary/60"
      style={{ height: CARD_HEIGHT }}
      title={effectiveTitle(book)}
    >
      <CoverArea
        coverUrl={coverUrl}
        coverError={coverError}
        onCoverError={() => setCoverError(true)}
        ingested={book.ingested}
        title={effectiveTitle(book)}
      />
      {book.aiSystem && book.aiSystem !== 'PF2e' && <SystemBadge system={book.aiSystem} />}
      {book.ruleset && <RulesetBadge ruleset={book.ruleset} />}
      <HoverMeta title={effectiveTitle(book)} pageCount={book.pageCount} />
    </button>
  );
}

export function ApCard({ group, onClick }: { group: ApGroup; onClick: () => void }) {
  const coverBook = group.parts[0]?.book;
  const [coverError, setCoverError] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    setCoverError(false);
    setCoverUrl(null);
    if (coverBook?.ingested) {
      api
        .booksGetCoverUrl(coverBook.id)
        .then(setCoverUrl)
        .catch((err) => {
          console.error(`Failed to load cover for book ${coverBook.id}:`, err);
          setCoverError(true);
        });
    }
  }, [coverBook?.id, coverBook?.ingested]);

  const totalPages = apTotalPages(group);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-all hover:border-primary/60"
      style={{ height: CARD_HEIGHT }}
      title={`${group.subcategory} (${group.parts.length}-part Adventure Path)`}
    >
      <CoverArea
        coverUrl={coverUrl}
        coverError={coverError}
        onCoverError={() => setCoverError(true)}
        ingested={coverBook?.ingested ?? false}
        title={group.subcategory}
      />
      {/* AP badge */}
      <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-0.5 rounded bg-primary/90 px-1 py-0.5 text-[9px] font-semibold text-primary-foreground shadow-xs">
        <Layers className="h-2.5 w-2.5" />
        {group.parts.length}
      </div>
      <HoverMeta
        title={group.subcategory}
        subtitle={`${group.parts.length}-part AP${totalPages != null ? ` · ${totalPages} pages` : ''}`}
      />
    </button>
  );
}

// Shared cover image area — fills the entire card.
function CoverArea({
  coverUrl,
  coverError,
  onCoverError,
  ingested,
  title,
}: {
  coverUrl: string | null;
  coverError: boolean;
  onCoverError: () => void;
  ingested: boolean;
  title: string;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-muted">
      {coverUrl && !coverError ? (
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          onError={onCoverError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            display: 'block',
          }}
          className="transition-transform group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <Library className="h-6 w-6 text-muted-foreground/40" />
          <span className="text-[9px] leading-tight text-muted-foreground/60">
            {ingested ? 'Cover unavailable' : 'Not yet opened'}
          </span>
        </div>
      )}
    </div>
  );
}

// Metadata overlay shown on hover at the bottom of the card.
function HoverMeta({ title, pageCount, subtitle }: { title: string; pageCount?: number | null; subtitle?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-black/75 px-2 py-1.5 backdrop-blur-sm transition-transform group-hover:translate-y-0">
      <div className="truncate text-xs font-medium leading-tight text-white">{title}</div>
      {subtitle && <div className="text-[10px] text-white/70">{subtitle}</div>}
      {!subtitle && pageCount != null && <div className="text-[10px] text-white/70">{pageCount} pages</div>}
    </div>
  );
}

function SystemBadge({ system }: { system: string }) {
  return (
    <div className="pointer-events-none absolute left-1 top-1 rounded bg-amber-600/90 px-1 py-0.5 text-[9px] font-semibold uppercase text-white shadow-xs">
      {system}
    </div>
  );
}

function RulesetBadge({ ruleset }: { ruleset: 'legacy' | 'remastered' }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute right-1 top-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase shadow-xs',
        ruleset === 'remastered' ? 'bg-primary/90 text-primary-foreground' : 'bg-muted-foreground/80 text-background',
      )}
    >
      {ruleset === 'remastered' ? 'R' : 'L'}
    </div>
  );
}
