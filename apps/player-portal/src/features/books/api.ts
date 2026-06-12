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

export interface UploadBookResult {
  id: number;
  title: string;
  category: string;
  subcategory: string | null;
  pageCount: number | null;
  sizeBytes: number;
}

export function uploadBook(formData: FormData, onProgress: (pct: number) => void): Promise<UploadBookResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/books/upload');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadBookResult);
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}
