// Shared positioning constants + viewport-clamp math for floating popovers.
// Two consumers today: useUuidHover (delegated `[data-uuid]` previews on
// enricher anchors) and Progression's FeatureChip (per-chip class-feature
// hover). Both want the same: open below the anchor when there's room,
// flip above when there isn't, cap to viewport when neither side fits.

/** Popover body width — used for left-edge viewport clamping. */
export const POPOVER_WIDTH = 420;
/** Gap between the anchor's edge and the popover. */
export const POPOVER_GAP = 6;
/** Preferred height; the "is there room here?" threshold. The actual
 *  popover scrolls inside its `maxHeight` when content exceeds it. */
export const POPOVER_PREFERRED_HEIGHT = 520;
/** Minimum margin from the viewport edge before clamping kicks in. */
export const POPOVER_VIEWPORT_EDGE_MARGIN = 12;
/** Delay before opening on hover — filters incidental mouseovers as the
 *  cursor passes across the trigger. */
export const POPOVER_HOVER_OPEN_DELAY_MS = 300;
/** Delay before closing on mouseleave — gives the cursor time to bridge
 *  from anchor → popover (or popover → nested popover) without flicker. */
export const POPOVER_HOVER_CLOSE_DELAY_MS = 140;

interface VerticalSlot {
  /** CSS `top` value for the popover. */
  top: number;
  /** When set to `translateY(-100%)`, the popover is shifted up by its own
   *  rendered height — used when flipping above the anchor so the popover's
   *  bottom always kisses the trigger by exactly POPOVER_GAP regardless of
   *  content length. (Using CSS `bottom` alone fails when an ancestor has a
   *  transform/filter that overrides fixed positioning.) */
  transform?: string;
  /** Cap on rendered height — popover scrolls internally beyond this. */
  maxHeight: number;
}

/**
 * Decide whether a popover anchored to `anchor` opens below (default) or
 * flips above when there isn't enough room, and how tall it can be before
 * scrolling internally. Falls back to whichever side has more space when
 * neither fits the preferred height.
 */
export function pickVerticalSlot(anchor: DOMRect): VerticalSlot {
  const viewportH = window.innerHeight;
  const spaceBelow = viewportH - anchor.bottom - POPOVER_GAP - POPOVER_VIEWPORT_EDGE_MARGIN;
  const spaceAbove = anchor.top - POPOVER_GAP - POPOVER_VIEWPORT_EDGE_MARGIN;

  if (spaceBelow >= POPOVER_PREFERRED_HEIGHT) {
    return { top: anchor.bottom + POPOVER_GAP, maxHeight: POPOVER_PREFERRED_HEIGHT };
  }
  if (spaceAbove >= POPOVER_PREFERRED_HEIGHT) {
    return { top: anchor.top - POPOVER_GAP, transform: 'translateY(-100%)', maxHeight: POPOVER_PREFERRED_HEIGHT };
  }
  if (spaceBelow >= spaceAbove) {
    return { top: anchor.bottom + POPOVER_GAP, maxHeight: Math.max(120, spaceBelow) };
  }
  const h = Math.max(120, spaceAbove);
  return { top: anchor.top - POPOVER_GAP, transform: 'translateY(-100%)', maxHeight: h };
}

/** Clamp the popover's `left` so it doesn't run off the viewport on either side. */
export function clampPopoverLeft(anchorLeft: number): number {
  const maxLeft = window.innerWidth - POPOVER_WIDTH - POPOVER_VIEWPORT_EDGE_MARGIN;
  return Math.max(POPOVER_VIEWPORT_EDGE_MARGIN, Math.min(anchorLeft, maxLeft));
}
