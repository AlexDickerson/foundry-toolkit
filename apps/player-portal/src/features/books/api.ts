import type { BookEntry } from '@foundry-toolkit/pdf-reader';
import type { BookIndexEntry } from './types';

export async function fetchBooksIndex(): Promise<BookIndexEntry[]> {
  const res = await fetch('/books/_index.json');
  if (!res.ok) throw new Error(`Failed to fetch books index: ${res.status}`);
  return (await res.json()) as BookIndexEntry[];
}

export function indexEntryToBookEntry(entry: BookIndexEntry): BookEntry {
  const book: BookEntry = { id: entry.filename, title: entry.title };
  // Prefer the AI-classified category when present; combine with system so
  // catalog grouping reads as "PF2e — Rulebook" / "5e — Adventure" / etc.
  const cat = entry.aiCategory ?? entry.category;
  if (cat && entry.system) book.category = `${entry.system} — ${cat}`;
  else if (cat) book.category = cat;
  else if (entry.system) book.category = entry.system;
  if (entry.pageCount != null) book.pageCount = entry.pageCount;
  return book;
}
