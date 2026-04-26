import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { outputPathFor, parseArgs, runWithConcurrency, shouldSkip, type StatFn } from './upscale-icons.js';

// ── outputPathFor ──────────────────────────────────────────────────────────────

describe('outputPathFor', () => {
  it('preserves subdirectory structure and keeps .webp extension', () => {
    expect(outputPathFor('/icons/weapons/sword.webp', '/icons', '/out')).toBe(join('/out', 'weapons', 'sword.webp'));
  });

  it('converts .png input to .webp output', () => {
    expect(outputPathFor('/icons/armor/plate.png', '/icons', '/out')).toBe(join('/out', 'armor', 'plate.webp'));
  });

  it('handles deeply nested directories', () => {
    expect(outputPathFor('/icons/a/b/c/item.webp', '/icons', '/out')).toBe(join('/out', 'a', 'b', 'c', 'item.webp'));
  });

  it('handles a file at the root of inputDir', () => {
    expect(outputPathFor('/icons/ring.webp', '/icons', '/out')).toBe(join('/out', 'ring.webp'));
  });
});

// ── shouldSkip ────────────────────────────────────────────────────────────────

describe('shouldSkip', () => {
  const makeStatFn = (responses: Array<{ mtimeMs: number } | Error>): StatFn => {
    let call = 0;
    return async (_path: string) => {
      const r = responses[call++];
      if (r instanceof Error) throw r;
      return r;
    };
  };

  it('returns false immediately when force=true, without calling stat', async () => {
    const statFn = vi.fn() as unknown as StatFn;
    expect(await shouldSkip('/in/f.webp', '/out/f.webp', true, statFn)).toBe(false);
    expect(statFn).not.toHaveBeenCalled();
  });

  it('returns true when output exists and is newer than input', async () => {
    const statFn = makeStatFn([{ mtimeMs: 1000 }, { mtimeMs: 2000 }]);
    expect(await shouldSkip('/in/f.webp', '/out/f.webp', false, statFn)).toBe(true);
  });

  it('returns true when output mtime equals input mtime', async () => {
    const statFn = makeStatFn([{ mtimeMs: 1000 }, { mtimeMs: 1000 }]);
    expect(await shouldSkip('/in/f.webp', '/out/f.webp', false, statFn)).toBe(true);
  });

  it('returns false when output is older than input', async () => {
    const statFn = makeStatFn([{ mtimeMs: 2000 }, { mtimeMs: 1000 }]);
    expect(await shouldSkip('/in/f.webp', '/out/f.webp', false, statFn)).toBe(false);
  });

  it('returns false when output does not exist (stat throws)', async () => {
    const statFn = makeStatFn([{ mtimeMs: 1000 }, new Error('ENOENT')]);
    expect(await shouldSkip('/in/f.webp', '/out/f.webp', false, statFn)).toBe(false);
  });

  it('returns false when input stat fails', async () => {
    const statFn = makeStatFn([new Error('ENOENT'), { mtimeMs: 2000 }]);
    expect(await shouldSkip('/in/f.webp', '/out/f.webp', false, statFn)).toBe(false);
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('returns defaults when no flags are provided', () => {
    const cfg = parseArgs(['node', 'script.ts']);
    expect(cfg.input).toBeUndefined();
    expect(cfg.output).toBe('./output/equipment');
    expect(cfg.concurrency).toBe(2);
    expect(cfg.force).toBe(false);
    expect(cfg.realesrganBin).toBe('realesrgan-ncnn-vulkan');
    expect(cfg.help).toBe(false);
  });

  it('parses --input', () => {
    expect(parseArgs(['node', 'script.ts', '--input', '/my/icons']).input).toBe('/my/icons');
  });

  it('parses --output', () => {
    expect(parseArgs(['node', 'script.ts', '--output', '/my/out']).output).toBe('/my/out');
  });

  it('parses --concurrency', () => {
    expect(parseArgs(['node', 'script.ts', '--concurrency', '4']).concurrency).toBe(4);
  });

  it('parses --force', () => {
    expect(parseArgs(['node', 'script.ts', '--force']).force).toBe(true);
  });

  it('parses --realesrgan-bin', () => {
    expect(parseArgs(['node', 'script.ts', '--realesrgan-bin', '/usr/local/bin/realesrgan']).realesrganBin).toBe(
      '/usr/local/bin/realesrgan',
    );
  });

  it('parses --help / -h', () => {
    expect(parseArgs(['node', 'script.ts', '--help']).help).toBe(true);
    expect(parseArgs(['node', 'script.ts', '-h']).help).toBe(true);
  });

  it('parses all flags together', () => {
    const cfg = parseArgs([
      'node',
      'script.ts',
      '--input',
      '/in',
      '--output',
      '/out',
      '--concurrency',
      '8',
      '--force',
      '--realesrgan-bin',
      '/bin/realesrgan',
    ]);
    expect(cfg).toMatchObject({
      input: '/in',
      output: '/out',
      concurrency: 8,
      force: true,
      realesrganBin: '/bin/realesrgan',
    });
  });
});

// ── runWithConcurrency ────────────────────────────────────────────────────────

describe('runWithConcurrency', () => {
  it('runs all tasks exactly once', async () => {
    const executed: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
      executed.push(n);
    });
    await runWithConcurrency(tasks, 2);
    expect(executed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('resolves immediately for an empty task list', async () => {
    await expect(runWithConcurrency([], 2)).resolves.toBeUndefined();
  });

  it('handles concurrency larger than task count', async () => {
    const executed: number[] = [];
    const tasks = [1, 2].map((n) => async () => {
      executed.push(n);
    });
    await runWithConcurrency(tasks, 10);
    expect(executed).toHaveLength(2);
  });

  it('respects concurrency limit (no more than n in-flight at once)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 8 }, () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); // yield
      inFlight--;
    });
    await runWithConcurrency(tasks, 3);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
