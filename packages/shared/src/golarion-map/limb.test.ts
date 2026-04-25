// Unit tests for pure helpers in limb.ts.
// WebGL rendering is skipped — custom layers require a GPU context unavailable in jsdom.

import { describe, expect, it } from 'vitest';
import { mergeLimbOptions } from './limb.js';

// ---- mergeLimbOptions — defaults --------------------------------------------

describe('mergeLimbOptions — defaults', () => {
  it('returns all defaults when called with no argument', () => {
    const opts = mergeLimbOptions();
    expect(opts.opacity).toBe(0.3);
    expect(opts.exponent).toBe(1.5);
  });

  it('returns all defaults when called with an empty object', () => {
    const opts = mergeLimbOptions({});
    expect(opts.opacity).toBe(0.3);
    expect(opts.exponent).toBe(1.5);
  });

  it('returns all defaults when called with undefined', () => {
    const opts = mergeLimbOptions(undefined);
    expect(opts.opacity).toBe(0.3);
    expect(opts.exponent).toBe(1.5);
  });
});

// ---- mergeLimbOptions — partial overrides -----------------------------------

describe('mergeLimbOptions — partial overrides', () => {
  it('applies opacity override while keeping exponent default', () => {
    const opts = mergeLimbOptions({ opacity: 0.5 });
    expect(opts.opacity).toBe(0.5);
    expect(opts.exponent).toBe(1.5);
  });

  it('applies exponent override while keeping opacity default', () => {
    const opts = mergeLimbOptions({ exponent: 3.0 });
    expect(opts.exponent).toBe(3.0);
    expect(opts.opacity).toBe(0.3);
  });
});

// ---- mergeLimbOptions — full override ---------------------------------------

describe('mergeLimbOptions — full override', () => {
  it('uses all caller-supplied values when every field is provided', () => {
    const opts = mergeLimbOptions({ opacity: 0.6, exponent: 2.0 });
    expect(opts.opacity).toBe(0.6);
    expect(opts.exponent).toBe(2.0);
  });
});

// ---- mergeLimbOptions — edge cases ------------------------------------------

describe('mergeLimbOptions — edge cases', () => {
  it('accepts opacity of 0 (no darkening)', () => {
    expect(mergeLimbOptions({ opacity: 0 }).opacity).toBe(0);
  });

  it('accepts opacity of 1 (maximum darkening)', () => {
    expect(mergeLimbOptions({ opacity: 1 }).opacity).toBe(1);
  });

  it('accepts exponent of 0 (uniform darkening across entire disc)', () => {
    expect(mergeLimbOptions({ exponent: 0 }).exponent).toBe(0);
  });

  it('does not mutate the input options object', () => {
    const input = { opacity: 0.4 };
    mergeLimbOptions(input);
    expect(input).toEqual({ opacity: 0.4 });
  });
});
