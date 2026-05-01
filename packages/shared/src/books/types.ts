/** One row in the `books` table. Matches the SQLite schema in
 *  electron/book-db.ts one-to-one except for naming (snake_case in SQL,
 *  camelCase here) and the omitted `path` field — the renderer never sees
 *  the absolute path, it accesses PDFs via `book-file://files/<id>` URLs
 *  served by the main process. */
export interface Book {
  id: number;
  title: string;
  category: string;
  subcategory: string | null;
  ruleset: 'legacy' | 'remastered' | null;
  pageCount: number | null;
  fileSize: number;
  /** True once phase-2 ingest has run — we have a cached cover PNG and a
   *  real page count. Covers are fetched by the renderer via
   *  `book-file://covers/<id>` URLs; if this is false, the UI should show
   *  a placeholder instead of a broken image. */
  ingested: boolean;
  // AI classification (null until classified)
  aiSystem: string | null;
  aiCategory: string | null;
  aiSubcategory: string | null;
  aiTitle: string | null;
  aiPublisher: string | null;
  classified: boolean;
}

export interface BookClassification {
  system: string;
  category: string;
  subcategory: string | null;
  title: string;
  publisher: string | null;
}

export interface BookClassifyProgress {
  type: 'progress' | 'done' | 'error';
  bookId?: number;
  bookTitle?: string;
  current?: number;
  total?: number;
  error?: string;
}

/** Result of a phase-1 scan. Summary counts only — if the renderer needs
 *  the new data it calls `listBooks()` after the scan resolves. */
export interface BookScanResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

/** Renderer-to-main IPC payload for the phase-2 ingest finalize step. The
 *  renderer does the PDF rendering (so we don't have to build node-canvas
 *  on Windows) and ships the cover PNG bytes back as a plain Uint8Array
 *  via structured clone. */
export interface FinalizeIngestArgs {
  id: number;
  pageCount: number;
  /** Raw bytes of a 300 px-wide PNG. Main writes this to
   *  `<userData>/book-covers/<id>.png`. */
  coverPngBytes: Uint8Array;
}
