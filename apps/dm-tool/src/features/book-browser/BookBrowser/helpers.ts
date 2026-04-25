import type { Book } from '@foundry-toolkit/shared/types';
import { STORAGE_KEYS } from '@/lib/constants';
import { readJson, readString, writeJson, writeString } from '@/lib/storage-utils';
import type { PersistedTab, TabDef } from './types';

export function persistTabs(tabs: TabDef[], activeTabId: string) {
  const serializable: PersistedTab[] = tabs.map((t) => {
    if (t.kind === 'ap') return { id: t.id, kind: 'ap', subcategory: t.group.subcategory, title: t.title };
    return t as PersistedTab;
  });
  writeJson(STORAGE_KEYS.bookTabs, serializable);
  writeString(STORAGE_KEYS.bookActiveTab, activeTabId);
}

export function loadPersistedTabs(): { tabs: PersistedTab[]; activeTabId: string } | null {
  const tabs = readJson<PersistedTab[] | null>(STORAGE_KEYS.bookTabs, null);
  if (!tabs) return null;
  const active = readString(STORAGE_KEYS.bookActiveTab) ?? 'browser';
  return { tabs, activeTabId: active };
}

// Use AI-derived classification when available, fall back to folder-derived.
// For folder-derived books: category = system (e.g. "PF2e"), subcategory = category type (e.g. "Rulebooks").
export function effectiveSystem(b: Book): string {
  return b.aiSystem ?? b.category;
}
export function effectiveCategory(b: Book): string {
  return b.aiCategory ?? b.subcategory ?? 'Uncategorized';
}
export function effectivePublisher(b: Book): string | null {
  return b.aiPublisher ?? null;
}
export function effectiveTitle(b: Book): string {
  return b.aiTitle ?? b.title;
}

export const isApCategory = (n: string) => n === 'Adventure Path' || n === 'Adventure Paths';
