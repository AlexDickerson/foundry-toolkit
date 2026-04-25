// Unit tests for pure helpers in halo.ts.
// WebGL rendering is skipped — custom layers require a GPU context unavailable in jsdom.

import { describe, expect, it } from 'vitest';
import { mergeHaloOptions } from './halo.js';

// ---- mergeHaloOptions — defaults --------------------------------------------

describe('mergeHaloOptions — defaults', () => {
  it('returns all defaults when called with no argument', () => {
    const opts = mergeHaloOptions();
    expect(opts.widthPx).toBe(18);
    expect(opts.innerFeatherPx).toBe(8);
    expect(opts.color).toEqual([0.18, 0.52, 1.0]);
    expect(opts.opacity).toBe(0.45);
  });

  it('returns all defaults when called with an empty object', () => {
    const opts = mergeHaloOptions({});
    expect(opts.widthPx).toBe(18);
    expect(opts.innerFeatherPx).toBe(8);
    expect(opts.color).toEqual([0.18, 0.52, 1.0]);
    expect(opts.opacity).toBe(0.45);
  });

  it('returns all defaults when called with undefined', () => {
    const opts = mergeHaloOptions(undefined);
    expect(opts.widthPx).toBe(18);
    expect(opts.innerFeatherPx).toBe(8);
  });
});

// ---- mergeHaloOptions — partial overrides -----------------------------------

describe('mergeHaloOptions — partial overrides', () => {
  it('applies widthPx override while keeping other defaults', () => {
    const opts = mergeHaloOptions({ widthPx: 60 });
    expect(opts.widthPx).toBe(60);
    expect(opts.innerFeatherPx).toBe(8);
    expect(opts.opacity).toBe(0.45);
    expect(opts.color).toEqual([0.18, 0.52, 1.0]);
  });

  it('applies innerFeatherPx override while keeping other defaults', () => {
    const opts = mergeHaloOptions({ innerFeatherPx: 15 });
    expect(opts.innerFeatherPx).toBe(15);
    expect(opts.widthPx).toBe(18);
  });

  it('applies opacity override while keeping other defaults', () => {
    const opts = mergeHaloOptions({ opacity: 0.5 });
    expect(opts.opacity).toBe(0.5);
    expect(opts.widthPx).toBe(18);
    expect(opts.innerFeatherPx).toBe(8);
    expect(opts.color).toEqual([0.18, 0.52, 1.0]);
  });

  it('applies color override while keeping other defaults', () => {
    const color: [number, number, number] = [0.3, 0.7, 1.0];
    const opts = mergeHaloOptions({ color });
    expect(opts.color).toEqual([0.3, 0.7, 1.0]);
    expect(opts.opacity).toBe(0.45);
    expect(opts.widthPx).toBe(18);
  });
});

// ---- mergeHaloOptions — full override ---------------------------------------

describe('mergeHaloOptions — full override', () => {
  it('uses all caller-supplied values when every field is provided', () => {
    const color: [number, number, number] = [0.1, 0.4, 0.9];
    const opts = mergeHaloOptions({
      widthPx: 50,
      innerFeatherPx: 12,
      color,
      opacity: 0.9,
    });
    expect(opts.widthPx).toBe(50);
    expect(opts.innerFeatherPx).toBe(12);
    expect(opts.color).toEqual([0.1, 0.4, 0.9]);
    expect(opts.opacity).toBe(0.9);
  });

  it('preserves the exact color tuple reference when one is supplied', () => {
    const color: [number, number, number] = [0.2, 0.5, 0.8];
    const opts = mergeHaloOptions({ color });
    expect(opts.color).toBe(color);
  });
});

// ---- mergeHaloOptions — edge cases ------------------------------------------

describe('mergeHaloOptions — edge cases', () => {
  it('accepts widthPx of 0 (hairline halo)', () => {
    expect(mergeHaloOptions({ widthPx: 0 }).widthPx).toBe(0);
  });

  it('accepts innerFeatherPx of 0 (hard inner edge)', () => {
    expect(mergeHaloOptions({ innerFeatherPx: 0 }).innerFeatherPx).toBe(0);
  });

  it('accepts opacity of 0 (fully transparent)', () => {
    expect(mergeHaloOptions({ opacity: 0 }).opacity).toBe(0);
  });

  it('accepts opacity of 1 (fully opaque)', () => {
    expect(mergeHaloOptions({ opacity: 1 }).opacity).toBe(1);
  });

  it('does not mutate the input options object', () => {
    const input = { widthPx: 20 };
    mergeHaloOptions(input);
    expect(input).toEqual({ widthPx: 20 });
  });
});
