import { STORAGE_KEYS } from '@/lib/constants';
import { readString, writeString } from '@/lib/storage-utils';

export type ZoomPreset = 'fit-width' | 'fit-page' | '100' | '150' | '200';

export const ZOOM_PRESETS: Array<{ label: string; value: ZoomPreset }> = [
  { label: 'Fit Width', value: 'fit-width' },
  { label: 'Fit Page', value: 'fit-page' },
  { label: '100%', value: '100' },
  { label: '150%', value: '150' },
  { label: '200%', value: '200' },
];

export function resolveScale(
  preset: ZoomPreset,
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
): number {
  switch (preset) {
    case 'fit-width':
      return containerWidth / pageWidth;
    case 'fit-page':
      return Math.min(containerWidth / pageWidth, containerHeight / pageHeight);
    case '100':
      return 1;
    case '150':
      return 1.5;
    case '200':
      return 2;
  }
}

export function loadZoom(): ZoomPreset {
  const v = readString(STORAGE_KEYS.readerZoom);
  if (v && ZOOM_PRESETS.some((p) => p.value === v)) return v as ZoomPreset;
  return 'fit-width';
}

export function saveZoom(z: ZoomPreset) {
  writeString(STORAGE_KEYS.readerZoom, z);
}

export function cycleZoom(dir: 1 | -1, current: ZoomPreset, set: (v: ZoomPreset) => void) {
  const idx = ZOOM_PRESETS.findIndex((p) => p.value === current);
  const next = idx + dir;
  if (next >= 0 && next < ZOOM_PRESETS.length) {
    set(ZOOM_PRESETS[next]!.value);
  }
}
