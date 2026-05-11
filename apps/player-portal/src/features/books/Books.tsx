// Player portal Books page. Fetches the filesystem index from foundry-mcp's
// /books/_index.json endpoint and renders the shared BookCatalog. Clicking a
// book opens the shared PdfReader, which streams the PDF from /books/<filename>
// (proxied to foundry-mcp by both the Vite dev server and the Fastify prod server).
//
// Auth: the /books/* proxy is inside the cookie-session gate — no extra auth
// needed here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookCatalog, PdfReader, type BookEntry } from '@foundry-toolkit/pdf-reader';
import { fetchBooksIndex, indexEntryToBookEntry } from './api';
import type { BookIndexEntry } from './types';
import './books-theme.css';

// One-time pdfjs worker setup for this page. We do it at module load so the
// worker is ready before the first PdfReader mount.
import * as pdfjsLib from 'pdfjs-dist';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite resolves the ?url suffix at build time
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl as string;

export function Books() {
  const [entries, setEntries] = useState<BookIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState<BookEntry | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchBooksIndex()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[Books] failed to load index:', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  const books: BookEntry[] = entries.map(indexEntryToBookEntry);

  // filename → DB id for the cover URL lookup. Books without a DB row (or
  // without a cover blob) are omitted; the resolver returns a sentinel URL
  // that 404s so the card shows its placeholder instead.
  const coverIds = useMemo(
    () => new Map(entries.filter((e) => e.hasCover && e.dbId != null).map((e) => [e.filename, e.dbId!])),
    [entries],
  );

  const getCoverUrl = useCallback(
    (id: string) => {
      const dbId = coverIds.get(id);
      return dbId != null ? `/books/_covers/${dbId}` : '';
    },
    [coverIds],
  );

  if (openBook) {
    return (
      <div className="books-reader-root absolute inset-0">
        <PdfReader
          bookId={openBook.id}
          title={openBook.title}
          getBookUrl={(id) => `/books/${id.split('/').map(encodeURIComponent).join('/')}`}
          scrollStorageKey={`portal.reader.scroll.${openBook.id}`}
          zoomStorageKey="portal.reader.zoom"
          onClose={() => setOpenBook(null)}
        />
      </div>
    );
  }

  return (
    <div className="books-reader-root absolute inset-0 flex flex-col">
      <div className="shrink-0 border-b border-portal-border px-4 py-3">
        <h1 className="text-lg font-semibold text-portal-text">Library</h1>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-portal-text-muted">
          Could not load the book catalog. Is foundry-mcp running with FOUNDRY_MCP_BOOKS_DIR set?
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <BookCatalog
            books={books}
            onSelect={setOpenBook}
            loading={loading}
            emptyMessage={loading ? 'Loading…' : 'No PDF books found in the library.'}
            showCovers
            getCoverUrl={getCoverUrl}
          />
        </div>
      )}
    </div>
  );
}
