// MapLibre image registration for game-icons.net markers. Both the DM
// tool and the player portal share the same icon encoding + default-dot
// treatment — the DM tool adds its own IconPicker layer on top
// (ALL_ICON_NAMES + SUGGESTED_ICONS stay dm-tool-side).

import type { Map as MlMap } from 'maplibre-gl';
import iconsData from '@iconify-json/game-icons/icons.json';

/** The default golden fill used when no custom colour is chosen. */
const DEFAULT_FILL = 'hsl(32,95%,52%)';

/** Closest hex approximation of DEFAULT_FILL — used only to seed the
 *  native colour-picker input which requires a hex value. */
export const DEFAULT_FILL_HEX = '#f98c10';

const DEFAULT_KEY = 'gi-default';

/** Return the raw SVG path body for an icon name, or null if not found. */
export function getIconBody(name: string): string | null {
  const entry = (iconsData.icons as Record<string, { body: string }>)[name];
  return entry?.body ?? null;
}

/** MapLibre image key for a game-icon name (no colour override). */
export function iconKey(name: string): string {
  return `gi-${name}`;
}

/** Normalize an icon colour string.
 *  Returns the trimmed, lowercased hex string when the value looks like a
 *  valid CSS hex colour (#rgb, #rrggbb, or #rrggbbaa).  Returns '' for
 *  anything else — empty string means "use the default golden fill". */
export function normalizeIconColor(color: string | undefined): string {
  if (!color) return '';
  const trimmed = color.trim();
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed) ? trimmed.toLowerCase() : '';
}

/** MapLibre image key for a game-icon name with an optional custom fill colour.
 *  Falls back to the bare `gi-<name>` key when colour is empty so existing
 *  images (persisted without a colour) remain valid. */
export function coloredIconKey(name: string, color: string): string {
  return color ? `gi-${name}::${color}` : `gi-${name}`;
}

/** Parse a MapLibre image key produced by {@link coloredIconKey} (or the
 *  legacy bare {@link iconKey}) back to its component parts.
 *  Returns null for any string that doesn't start with 'gi-'. */
export function parseIconKey(key: string): { name: string; color: string } | null {
  if (!key.startsWith('gi-')) return null;
  const rest = key.slice(3);
  const sep = rest.indexOf('::');
  if (sep === -1) return { name: rest, color: '' };
  return { name: rest.slice(0, sep), color: rest.slice(sep + 2) };
}

function loadSvgImage(map: MlMap, key: string, svg: string, size: number): void {
  const img = new Image(size, size);
  img.onload = () => {
    if (!map.hasImage(key)) map.addImage(key, img);
  };
  img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Register the default dot image used for pins with no icon.
 *  Pass a custom hex colour to get a colour-specific key; omit (or pass '')
 *  to get the standard golden dot at 'gi-default'. */
export function ensureDefaultImage(map: MlMap, color?: string): void {
  const normalizedColor = normalizeIconColor(color);
  const key = normalizedColor ? `gi-default::${normalizedColor}` : DEFAULT_KEY;
  if (map.hasImage(key)) return;
  const size = 48;
  const fill = normalizedColor || DEFAULT_FILL;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${fill}" stroke="white" stroke-width="3"/>
  </svg>`;
  loadSvgImage(map, key, svg, size);
}

/** Ensure a game-icon is registered as a MapLibre image.
 *  When `color` is a valid hex string the image is keyed by both name and
 *  colour so different-coloured instances of the same icon coexist in the
 *  MapLibre image cache without conflict. */
export function ensureIconImage(map: MlMap, name: string, color?: string): void {
  const normalizedColor = normalizeIconColor(color);
  const key = coloredIconKey(name, normalizedColor);
  if (map.hasImage(key)) return;
  const body = getIconBody(name);
  if (!body) return;
  const size = 48;
  const pad = size * 0.15;
  const scale = (size - pad * 2) / 512;
  const fill = normalizedColor || DEFAULT_FILL;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${fill}" stroke="white" stroke-width="3"/>
    <g transform="translate(${pad},${pad}) scale(${scale})" fill="white">${body}</g>
  </svg>`;
  loadSvgImage(map, key, svg, size);
}

/** Resolve a pin's icon field to the MapLibre image key, ensuring the image
 *  is registered as a side effect.  Accepts an optional `color` override
 *  (hex string); the resolved key encodes the colour so MapLibre keeps
 *  colour-distinct variants separate in its image cache. */
export function resolvePinIcon(map: MlMap, icon: string, color?: string): string {
  const normalizedColor = normalizeIconColor(color);
  if (!icon) {
    ensureDefaultImage(map, normalizedColor);
    return normalizedColor ? `gi-default::${normalizedColor}` : DEFAULT_KEY;
  }
  ensureIconImage(map, icon, normalizedColor);
  return coloredIconKey(icon, normalizedColor);
}

/** Render an icon as an inline SVG string for use in React (picker thumbnails). */
export function iconSvgHtml(name: string, size = 24): string {
  const body = getIconBody(name);
  if (!body) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" fill="currentColor">${body}</svg>`;
}
