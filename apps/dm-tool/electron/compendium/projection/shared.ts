// Shared low-level helpers used by every per-type projection module.
// Nothing here depends on a specific document type.

import { cleanFoundryMarkup } from '@foundry-toolkit/shared/foundry-markup';
import type { CompendiumDocument } from '../types.js';

// Map PF2e action-glyph font characters to Unicode symbols.
const ACTION_GLYPH: Record<string, string> = {
  '1': '◆',
  A: '◆',
  '2': '◆◆',
  D: '◆◆',
  '3': '◆◆◆',
  T: '◆◆◆',
  r: '↺',
  R: '↺',
  f: '◇',
  F: '◇',
};

/** Strip Foundry @-tags and HTML from descriptions. Ported verbatim from
 *  `packages/db/src/pf2e/compendium.ts`. */
export function cleanDescription(html: string | null | undefined): string {
  if (!html) return '';
  let text = cleanFoundryMarkup(html)
    .replace(
      /<span[^>]*class="[^"]*action-glyph[^"]*"[^>]*>([^<]*)<\/span>/gi,
      (_, ch: string) => ACTION_GLYPH[ch.trim()] ?? ch,
    )
    .replace(
      /<span[^>]*class="[^"]*pf2-icon[^"]*"[^>]*>([^<]*)<\/span>/gi,
      (_, ch: string) => ACTION_GLYPH[ch.trim()] ?? ch,
    )
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[\s>]/gi, '\n');
  let prev: string;
  do {
    prev = text;
    text = text.replace(/<[^>]+>/g, '');
  } while (text !== prev);
  const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
  return text
    .replace(/&(?:nbsp|amp|lt|gt);/g, (m) => entities[m])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Narrow defensive readers — every field is `unknown` at the outer boundary
// ---------------------------------------------------------------------------

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function readSystem(doc: CompendiumDocument): Record<string, unknown> {
  return isRecord(doc.system) ? doc.system : {};
}

export function readPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function readNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function readString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ---------------------------------------------------------------------------
// Portrait / token URL helpers
// ---------------------------------------------------------------------------

/** Return null for Foundry's generic placeholder icons — they're not
 *  real portraits and aren't worth fetching or displaying. */
export function isDefaultIcon(path: string): boolean {
  return path.includes('/default-icons/');
}

/** Return the portrait path, or null if it's a default placeholder. */
export function pickPortraitUrl(doc: CompendiumDocument): string | null {
  const img = doc.img;
  if (!img || isDefaultIcon(img)) return null;
  return img;
}

/** Prefer a doc-level tokenImg when the mcp bridge populates it; fall
 *  back to the portrait. See the prototypeToken bridge PR. */
export function pickTokenUrl(doc: CompendiumDocument): string | null {
  const maybe = (doc as { tokenImg?: unknown }).tokenImg;
  if (typeof maybe === 'string' && maybe.length > 0 && !isDefaultIcon(maybe)) return maybe;
  // TODO(compendium-migration): once bridge PR landing prototypeToken
  // merges, this fallback can be removed — `tokenImg` will always be
  // present on actor docs and we'll surface null when it's genuinely
  // missing (unlike the portrait, which every doc has).
  return pickPortraitUrl(doc);
}
