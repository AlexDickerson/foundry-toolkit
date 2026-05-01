import { describe, expect, it, vi } from 'vitest';
import { pickVerticalSlot } from './useUuidHover';

// Helpers to build a minimal DOMRect for pickVerticalSlot.
const makeRect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

const POPOVER_GAP = 6;
const PREFERRED_HEIGHT = 520;
const VIEWPORT_EDGE_MARGIN = 12;

describe('pickVerticalSlot', () => {
  it('renders below when there is preferred height below', () => {
    vi.stubGlobal('innerHeight', 900);
    // Anchor near the top — plenty of space below.
    const anchor = makeRect(50, 70);
    const slot = pickVerticalSlot(anchor);
    expect(slot.top).toBe(70 + POPOVER_GAP);
    expect(slot.bottom).toBeUndefined();
    expect(slot.maxHeight).toBe(PREFERRED_HEIGHT);
  });

  it('flips above using bottom-anchor when space below is insufficient', () => {
    vi.stubGlobal('innerHeight', 900);
    // Anchor near the bottom — not enough space below, plenty above.
    const anchor = makeRect(700, 720);
    const slot = pickVerticalSlot(anchor);

    // Must use bottom, not top, so a short popover stays adjacent to the trigger.
    expect(slot.top).toBeUndefined();
    expect(slot.bottom).toBe(900 - 700 + POPOVER_GAP); // viewportH - anchor.top + GAP
    expect(slot.maxHeight).toBe(PREFERRED_HEIGHT);
  });

  it('bottom-anchor places the popover bottom POPOVER_GAP above the trigger (regression)', () => {
    vi.stubGlobal('innerHeight', 900);
    const anchor = makeRect(700, 720);
    const slot = pickVerticalSlot(anchor);

    // With fixed bottom-anchoring, the rendered bottom of the popover is at:
    //   viewportH - slot.bottom  =  900 - (900 - 700 + 6)  =  694  =  anchor.top - GAP
    // Regardless of how short the actual content is, the gap is always exactly POPOVER_GAP.
    const popoverBottom = 900 - (slot.bottom ?? 0);
    expect(popoverBottom).toBe(anchor.top - POPOVER_GAP);
  });

  it('fallback below when neither side has preferred height', () => {
    vi.stubGlobal('innerHeight', 400);
    // Anchor in the middle of a short viewport.
    const anchor = makeRect(180, 200);
    // spaceBelow = 400-200-6-12 = 182; spaceAbove = 180-6-12 = 162 → below wins
    const slot = pickVerticalSlot(anchor);
    expect(slot.top).toBe(200 + POPOVER_GAP);
    expect(slot.bottom).toBeUndefined();
    expect(slot.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it('fallback above uses bottom-anchor when above has more space', () => {
    vi.stubGlobal('innerHeight', 400);
    // Anchor near bottom of a short viewport.
    const anchor = makeRect(250, 270);
    // spaceBelow = 400-270-6-12 = 112; spaceAbove = 250-6-12 = 232 → above wins
    const slot = pickVerticalSlot(anchor);
    expect(slot.top).toBeUndefined();
    expect(slot.bottom).toBe(400 - 250 + POPOVER_GAP);
    expect(slot.maxHeight).toBe(250 - POPOVER_GAP - VIEWPORT_EDGE_MARGIN); // = spaceAbove
  });

  it('below gap is consistent with above gap', () => {
    // Verify the gap constant is applied symmetrically.
    vi.stubGlobal('innerHeight', 900);

    const anchorBelow = makeRect(50, 70);
    const slotBelow = pickVerticalSlot(anchorBelow);
    const belowGap = (slotBelow.top ?? 0) - anchorBelow.bottom;

    const anchorAbove = makeRect(700, 720);
    const slotAbove = pickVerticalSlot(anchorAbove);
    const popoverBottomAbove = 900 - (slotAbove.bottom ?? 0);
    const aboveGap = anchorAbove.top - popoverBottomAbove;

    expect(belowGap).toBe(aboveGap);
    expect(belowGap).toBe(POPOVER_GAP);
  });
});
