import type { Book } from '@foundry-toolkit/shared/types';
import type { ApGroup } from '../ap-merge';

// Shared types for the book-browser route. Consumed by the main
// BookBrowser entry, the catalog grid + card components, and the
// localStorage tab persistence helpers.

/** A single catalog row — either a regular Book, a merged AP group,
 *  or a section header divider rendered by `CatalogGrid`. */
export type CatalogEntry =
  | { kind: 'book'; book: Book }
  | { kind: 'ap'; group: ApGroup }
  | { kind: 'section'; label: string };

/** Open tab in the BookBrowser tab bar. The 'browser' tab is the
 *  catalog view itself; book/ap tabs render a `BookReader` for one
 *  PDF or a merged AP group respectively. */
export type TabDef =
  | { id: 'browser'; kind: 'browser' }
  | { id: string; kind: 'book'; bookId: number; title: string }
  | { id: string; kind: 'ap'; group: ApGroup; title: string };

/** Serializable shape saved to localStorage. ApGroup is rebuilt from
 *  `subcategory` + the live AP grouping on rehydrate. */
export type PersistedTab =
  | { id: 'browser'; kind: 'browser' }
  | { id: string; kind: 'book'; bookId: number; title: string }
  | { id: string; kind: 'ap'; subcategory: string; title: string };
