import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

export interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

/** Outline node tagged with its slot index so TOC navigation resolves
 *  destinations against the correct PDF in a multi-doc view. */
export interface TaggedOutlineNode extends OutlineNode {
  slotIndex: number;
  items: TaggedOutlineNode[];
}

/** One document in a multi-doc (or single-doc) view. */
export interface DocSlot {
  id: string;
  partLabel: string;
  pageCount: number;
  globalPageOffset: number;
  doc: PDFDocumentProxy | null;
  outline: OutlineNode[];
}
