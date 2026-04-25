import { STORAGE_KEYS } from '@/lib/constants';
import { readNumber, writeString } from '@/lib/storage-utils';
import type { ApGroup } from '../ap-merge';

// Page layout constants — used by the BookReader main, the multi-doc
// page list, and the slot-offset calculation. Kept here alongside the
// scroll-position storage helpers so anything reading or writing
// scroll positions can find the gap/separator sizes too.
export const PAGE_GAP = 8;
export const SEPARATOR_HEIGHT = 48;

/** Stable key for scroll position: single book uses the bookId, merged
 *  APs use "ap-<subcategory>". */
export function scrollKey(bookId?: number, apGroup?: ApGroup): string | null {
  if (apGroup) return `${STORAGE_KEYS.readerScrollPrefix}ap-${apGroup.subcategory}`;
  if (bookId != null) return `${STORAGE_KEYS.readerScrollPrefix}${bookId}`;
  return null;
}

export function loadScroll(key: string | null): number {
  if (!key) return 0;
  return readNumber(key, 0);
}

export function saveScroll(key: string | null, top: number) {
  if (!key) return;
  writeString(key, String(Math.round(top)));
}
