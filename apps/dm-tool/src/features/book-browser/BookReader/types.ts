import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { ApGroup } from '../ap-merge';

// Shared types for the BookReader route. Consumed by the main reader,
// the TOC sidebar, and the multi-doc page list.

export interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

/** A tagged outline node that knows which doc slot it belongs to. Used by
 *  the combined TOC so destination resolution targets the right PDF. */
export interface TaggedOutlineNode extends OutlineNode {
  slotIndex: number;
  items: TaggedOutlineNode[];
}

export interface ReaderProps {
  /** Single book mode — open one PDF. */
  bookId?: number;
  /** Merged AP mode — open all parts as one combined document. */
  apGroup?: ApGroup;
  onClose: () => void;
  /** Navigate back to catalog without closing the tab. Falls back to onClose. */
  onBack?: () => void;
  onIngestComplete?: () => void;
}

/** One document in a multi-doc view. */
export interface DocSlot {
  bookId: number;
  partLabel: string;
  pageCount: number;
  globalPageOffset: number;
  doc: PDFDocumentProxy | null;
  outline: OutlineNode[];
}
