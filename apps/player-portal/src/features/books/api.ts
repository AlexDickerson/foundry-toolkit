import type { BookEntry } from '@foundry-toolkit/pdf-reader';
import type { BookIndexEntry } from './types';

export async function fetchBooksIndex(): Promise<BookIndexEntry[]> {
  const res = await fetch('/books/_index.json');
  if (!res.ok) throw new Error(`Failed to fetch books index: ${res.status}`);
  return (await res.json()) as BookIndexEntry[];
}

export function indexEntryToBookEntry(entry: BookIndexEntry): BookEntry {
  const book: BookEntry = { id: entry.filename, title: entry.title };
  if (entry.category) book.category = entry.category;
  return book;
}
