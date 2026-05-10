import { describe, expect, it, vi } from 'vitest';
import {
  pickVerticalSlot,
  POPOVER_GAP,
  POPOVER_PREFERRED_HEIGHT as PREFERRED_HEIGHT,
  POPOVER_VIEWPORT_EDGE_MARGIN as VIEWPORT_EDGE_MARGIN,
} from './popover-positioning';

const makeRect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

describe('pickVerticalSlot', () => {
  it('renders below when there is preferred height below', () => {
    vi.stubGlobal('innerHeight', 900);
    const anchor = makeRect(50, 70);
    const slot = pickVerticalSlot(anchor);
    expect(slot.top).toBe(70 + POPOVER_GAP);
    expect(slot.transform).toBeUndefined();
    expect(slot.maxHeight).toBe(PREFERRED_HEIGHT);
  });

  it('flips above using translateY(-100%) when space below is insufficient', () => {
    vi.stubGlobal('innerHeight', 900);
    // Anchor near the bottom — not enough space below, plenty above.
    const anchor = makeRect(700, 720);
    const slot = pickVerticalSlot(anchor);

    expect(slot.top).toBe(700 - POPOVER_GAP);
    expect(slot.transform).toBe('translateY(-100%)');
    expect(slot.maxHeight).toBe(PREFERRED_HEIGHT);
  });

  it('translateY(-100%) places the popover bottom POPOVER_GAP above the trigger (regression)', () => {
    vi.stubGlobal('innerHeight', 900);
    const anchor = makeRect(700, 720);
    const slot = pickVerticalSlot(anchor);

    // `top` is the CSS top edge before the transform. The transform shifts
    // the element up by its own rendered height. Regardless of content height,
    // the bottom of the element will always be at `top` — i.e. anchor.top - GAP.
    // So the gap is always exactly POPOVER_GAP.
    expect(slot.top).toBe(anchor.top - POPOVER_GAP);
    // Visual bottom = slot.top (since translateY(-100%) shifts by rendered height,
    // making visual_bottom = css_top + rendered_height - rendered_height = css_top).
    const visualBottom = slot.top; // after translateY(-100%), bottom == top in CSS space
    expect(anchor.top - visualBottom).toBe(POPOVER_GAP);
  });

  it('fallback below when neither side has preferred height', () => {
    vi.stubGlobal('innerHeight', 400);
    // spaceBelow = 400-200-6-12=182; spaceAbove = 180-6-12=162 → below wins
    const anchor = makeRect(180, 200);
    const slot = pickVerticalSlot(anchor);
    expect(slot.top).toBe(200 + POPOVER_GAP);
    expect(slot.transform).toBeUndefined();
    expect(slot.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it('fallback above uses translateY(-100%) when above has more space', () => {
    vi.stubGlobal('innerHeight', 400);
    // spaceBelow = 400-270-6-12=112; spaceAbove = 250-6-12=232 → above wins
    const anchor = makeRect(250, 270);
    const slot = pickVerticalSlot(anchor);
    expect(slot.top).toBe(250 - POPOVER_GAP);
    expect(slot.transform).toBe('translateY(-100%)');
    expect(slot.maxHeight).toBe(250 - POPOVER_GAP - VIEWPORT_EDGE_MARGIN);
  });

  it('below gap is consistent with above gap', () => {
    vi.stubGlobal('innerHeight', 900);

    const anchorBelow = makeRect(50, 70);
    const slotBelow = pickVerticalSlot(anchorBelow);
    const belowGap = slotBelow.top - anchorBelow.bottom;

    const anchorAbove = makeRect(700, 720);
    const slotAbove = pickVerticalSlot(anchorAbove);
    // For above: visual bottom = css top (after translateY(-100%)), gap = anchor.top - css.top
    const aboveGap = anchorAbove.top - slotAbove.top;

    expect(belowGap).toBe(aboveGap);
    expect(belowGap).toBe(POPOVER_GAP);
  });
});
