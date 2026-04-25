// Golarion globe auto-rotation helper.
// Advances the map center longitude each animation frame so the globe
// appears to spin slowly under a stationary viewer. Rotation stops
// permanently on the first user interaction (drag, zoom, pitch, wheel,
// click, touch) and can also be cancelled manually via the returned
// teardown function.
//
// Use `jumpTo` (not `easeTo`) for per-frame nudges — it's cheaper and
// avoids fighting its own animation queue.

import type { Map } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AutoRotateOptions {
  /** Degrees to advance per second. Default 6 (one full revolution per ~60 s). */
  degreesPerSecond?: number;
  /**
   * Rotation direction.
   * - `'east'` (default, earth-like): positive longitude delta.
   * - `'west'`: negative longitude delta.
   */
  direction?: 'east' | 'west';
  /**
   * Delay in milliseconds before the rAF loop starts.
   * Useful to let the page settle after load. Default 0.
   */
  startDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const DEFAULTS: Required<AutoRotateOptions> = {
  degreesPerSecond: 6,
  direction: 'east',
  startDelayMs: 0,
};

/**
 * Normalise a longitude value to the half-open range [-180, 180).
 * Handles values that have drifted far outside the range over many frames.
 */
export function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// ---------------------------------------------------------------------------
// startAutoRotate
// ---------------------------------------------------------------------------

/**
 * Start slowly auto-rotating the globe by incrementing the map center
 * longitude on every animation frame.
 *
 * @returns A teardown function. Call it to cancel rotation manually.
 *          Rotation also self-cancels on the first user interaction.
 */
export function startAutoRotate(map: Map, options?: AutoRotateOptions): () => void {
  const opts: Required<AutoRotateOptions> = { ...DEFAULTS, ...options };

  console.info('[shared:auto-rotate] startAutoRotate invoked', {
    degreesPerSecond: opts.degreesPerSecond,
    direction: opts.direction,
    startDelayMs: opts.startDelayMs,
  });

  let rafId: number | null = null;
  let lastTimestamp: number | null = null;
  let cancelled = false;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;

  const canvas = map.getCanvas();

  // ---- Interaction listeners -----------------------------------------------

  // MapLibre *start events carry `originalEvent` only when the action was
  // user-initiated. Programmatic changes (e.g. our own jumpTo calls) do not
  // set originalEvent, so we ignore those to avoid self-cancelling.
  function onMapStart(e: { originalEvent?: Event }): void {
    if (e.originalEvent) {
      cancel('interaction');
    }
  }

  // DOM events on the canvas fire only on real user input — no filtering needed.
  function onDomInteraction(): void {
    cancel('interaction');
  }

  // ---- Cancel / teardown --------------------------------------------------

  function removeListeners(): void {
    map.off('dragstart', onMapStart);
    map.off('rotatestart', onMapStart);
    map.off('pitchstart', onMapStart);
    map.off('zoomstart', onMapStart);
    canvas.removeEventListener('wheel', onDomInteraction);
    canvas.removeEventListener('mousedown', onDomInteraction);
    canvas.removeEventListener('touchstart', onDomInteraction);
  }

  function cancel(reason: 'interaction' | 'manual'): void {
    if (cancelled) return;
    cancelled = true;

    if (delayTimer !== null) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    removeListeners();
    console.info(`[shared:auto-rotate] rotation stopped (${reason})`);
  }

  // ---- rAF loop -----------------------------------------------------------

  function frame(timestamp: number): void {
    if (cancelled) return;

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const dt = (timestamp - lastTimestamp) / 1000; // seconds
    lastTimestamp = timestamp;

    const center = map.getCenter();
    const sign = opts.direction === 'east' ? 1 : -1;
    const newLng = normalizeLng(center.lng + opts.degreesPerSecond * dt * sign);

    map.jumpTo({ center: [newLng, center.lat] });

    rafId = requestAnimationFrame(frame);
  }

  function startLoop(): void {
    if (cancelled) return;
    rafId = requestAnimationFrame(frame);
  }

  // Register interaction listeners immediately so any user touch before the
  // delay elapses also cancels the pending start.
  map.on('dragstart', onMapStart);
  map.on('rotatestart', onMapStart);
  map.on('pitchstart', onMapStart);
  map.on('zoomstart', onMapStart);
  canvas.addEventListener('wheel', onDomInteraction, { passive: true });
  canvas.addEventListener('mousedown', onDomInteraction);
  canvas.addEventListener('touchstart', onDomInteraction, { passive: true });

  if (opts.startDelayMs > 0) {
    delayTimer = setTimeout(startLoop, opts.startDelayMs);
  } else {
    startLoop();
  }

  return () => cancel('manual');
}
