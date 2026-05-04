import { useCallback, useEffect, useState } from 'react';

// Grid column count — fixed to match the `repeat(5, ...)` template.
const GRID_COLS = 5;
// Approximate tile height (including gap).
const TILE_HEIGHT_PX = 146;
const GRID_GAP_PX = 8;
const MIN_FIT_PAGE_SIZE = 6;
// Breathing room between the grid's bottom edge and the viewport bottom
// (bottom pagination bar ~32px + container p-6 24px + safety margin).
const VIEWPORT_BOTTOM_MARGIN_PX = 72;

const FALLBACK_PAGE_SIZE = 25;

export function useFitPageSize(): {
  pageSize: number;
  maxHeight: number | null;
  gridRef: (el: HTMLUListElement | null) => void;
} {
  const [pageSize, setPageSize] = useState(FALLBACK_PAGE_SIZE);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  // Callback ref fires synchronously when the grid element attaches/
  // detaches, so the ResizeObserver wires up even though the grid is
  // conditionally rendered (only after results arrive).
  const [gridEl, setGridEl] = useState<HTMLUListElement | null>(null);
  const gridRef = useCallback((el: HTMLUListElement | null) => {
    setGridEl(el);
  }, []);

  useEffect(() => {
    if (!gridEl || typeof ResizeObserver === 'undefined') return;
    const recompute = (): void => {
      const rect = gridEl.getBoundingClientRect();
      const availableHeight = Math.max(200, window.innerHeight - rect.top - VIEWPORT_BOTTOM_MARGIN_PX);
      setMaxHeight(availableHeight);
      const rows = Math.max(1, Math.floor((availableHeight + GRID_GAP_PX) / (TILE_HEIGHT_PX + GRID_GAP_PX)));
      setPageSize(Math.max(MIN_FIT_PAGE_SIZE, GRID_COLS * rows));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(gridEl);
    window.addEventListener('resize', recompute);
    return (): void => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [gridEl]);

  return { pageSize, maxHeight, gridRef };
}
