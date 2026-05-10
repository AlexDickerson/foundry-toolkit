import { readNumber, writeString } from '../lib/storage';

export const PAGE_GAP = 8;
export const SEPARATOR_HEIGHT = 48;

export function loadScroll(key: string | null): number {
  if (!key) return 0;
  return readNumber(key, 0);
}

export function saveScroll(key: string | null, top: number): void {
  if (!key) return;
  writeString(key, String(Math.round(top)));
}
