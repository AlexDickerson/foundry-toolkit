import { describe, expect, it } from 'vitest';
import { mergeCloudsOptions } from './clouds';

describe('mergeCloudsOptions — defaults', () => {
  it('returns all defaults when called with no argument', () => {
    const opts = mergeCloudsOptions();
    expect(opts.opacity).toBe(0.25);
    expect(opts.driftSpeed).toBe(0.02);
    expect(opts.scale).toBe(3.0);
    expect(opts.color).toEqual([1, 0.98, 0.95]);
  });

  it('returns all defaults when called with an empty object', () => {
    const opts = mergeCloudsOptions({});
    expect(opts.opacity).toBe(0.25);
    expect(opts.driftSpeed).toBe(0.02);
    expect(opts.scale).toBe(3.0);
    expect(opts.color).toEqual([1, 0.98, 0.95]);
  });

  it('returns all defaults when called with undefined', () => {
    const opts = mergeCloudsOptions(undefined);
    expect(opts.opacity).toBe(0.25);
    expect(opts.driftSpeed).toBe(0.02);
  });
});

describe('mergeCloudsOptions — partial overrides', () => {
  it('applies opacity override while keeping other defaults', () => {
    const opts = mergeCloudsOptions({ opacity: 0.5 });
    expect(opts.opacity).toBe(0.5);
    expect(opts.driftSpeed).toBe(0.02);
    expect(opts.scale).toBe(3.0);
    expect(opts.color).toEqual([1, 0.98, 0.95]);
  });

  it('applies driftSpeed override while keeping other defaults', () => {
    const opts = mergeCloudsOptions({ driftSpeed: 0.02 });
    expect(opts.driftSpeed).toBe(0.02);
    expect(opts.opacity).toBe(0.25);
  });

  it('applies scale override while keeping other defaults', () => {
    const opts = mergeCloudsOptions({ scale: 6.0 });
    expect(opts.scale).toBe(6.0);
    expect(opts.opacity).toBe(0.25);
  });

  it('applies color override while keeping other defaults', () => {
    const color: [number, number, number] = [0.8, 0.9, 1.0];
    const opts = mergeCloudsOptions({ color });
    expect(opts.color).toEqual([0.8, 0.9, 1.0]);
    expect(opts.opacity).toBe(0.25);
  });
});

describe('mergeCloudsOptions — full override', () => {
  it('uses all caller-supplied values when every field is provided', () => {
    const opts = mergeCloudsOptions({
      opacity: 0.8,
      driftSpeed: 0.03,
      scale: 5.0,
      color: [0.9, 0.95, 1.0],
    });
    expect(opts.opacity).toBe(0.8);
    expect(opts.driftSpeed).toBe(0.03);
    expect(opts.scale).toBe(5.0);
    expect(opts.color).toEqual([0.9, 0.95, 1.0]);
  });

  it('preserves the exact color tuple reference when one is supplied', () => {
    const color: [number, number, number] = [0.8, 0.9, 1.0];
    const opts = mergeCloudsOptions({ color });
    expect(opts.color).toBe(color);
  });
});

describe('mergeCloudsOptions — edge cases', () => {
  it('accepts opacity of 0 (fully transparent)', () => {
    expect(mergeCloudsOptions({ opacity: 0 }).opacity).toBe(0);
  });

  it('accepts opacity of 1 (fully opaque)', () => {
    expect(mergeCloudsOptions({ opacity: 1 }).opacity).toBe(1);
  });

  it('accepts driftSpeed of 0 (static clouds)', () => {
    expect(mergeCloudsOptions({ driftSpeed: 0 }).driftSpeed).toBe(0);
  });
});
