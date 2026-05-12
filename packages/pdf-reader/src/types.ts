/** A book entry for the catalog grid. Consumer-supplied; the shared package
 *  never fetches book metadata itself. */
export interface BookEntry {
  id: string;
  title: string;
  category?: string;
  pageCount?: number;
}

/** One document slot in a multi-part viewer (e.g. Adventure Path parts). */
export interface PdfReaderDocSlot {
  id: string;
  partLabel: string;
  /** Known page count from DB/index. If omitted the component loads the PDF
   *  eagerly to read numPages. */
  pageCount?: number;
}

export interface PdfReaderProps {
  /** Called with a bookId; returns a URL (sync or async). This is the only
   *  mechanism for resolving PDF bytes — no API calls happen inside the component. */
  getBookUrl: (id: string) => string | Promise<string>;

  /** Single-doc mode — open one PDF by id. */
  bookId?: string;
  /** Display title shown in the toolbar. Pass the book's display title from
   *  your own data source; the component never fetches metadata. */
  title?: string;

  /** Multi-doc mode — open a sequence of PDFs as one scrollable document.
   *  Used for multi-part adventure paths or similar grouped PDFs. */
  docSlots?: PdfReaderDocSlot[];

  onClose: () => void;
  /** Navigate back to catalog without closing (falls back to onClose). */
  onBack?: () => void;

  /** Full localStorage key for scroll-position persistence.
   *  Defaults to `pdf-reader.scroll.${bookId}` in single mode. */
  scrollStorageKey?: string;
  /** Full localStorage key for the zoom-level preference (shared across books).
   *  Defaults to `pdf-reader.zoom`. */
  zoomStorageKey?: string;
}

export interface BookCatalogProps {
  books: BookEntry[];
  onSelect: (book: BookEntry) => void;
  /** Show cover images using getCoverUrl. Off by default. */
  showCovers?: boolean;
  /** Called with bookId; should return a URL for the cover image. */
  getCoverUrl?: (id: string) => string | Promise<string>;
  /** Placeholder shown when books is empty and loading is false. */
  emptyMessage?: string;
  loading?: boolean;
  /** Category to select by default when the catalog first receives books.
   *  Ignored once the user has interacted with the filter. If the value
   *  doesn't appear among the categories, no default is applied. */
  defaultCategory?: string;
}
