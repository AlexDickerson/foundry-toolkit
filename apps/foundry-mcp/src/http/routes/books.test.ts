import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerBooksRoute } from './books.js';
import type { BookIndexEntry } from './books.js';

// Spin up a minimal Fastify instance for each test.
async function buildApp(booksDir: string | undefined) {
  // Temporarily override the env var read by the route via config.ts.
  // Since the route imports from config.js, we stub the module-level export
  // by monkey-patching the cached import — but in ESM that's sealed.
  // Instead, we test the route by seeding a temp dir and setting the env var
  // before the module loads. Here we register the route handler directly
  // with a patched env var approach using a factory that re-imports config.

  // Simpler approach: the route reads FOUNDRY_MCP_BOOKS_DIR from config.ts
  // at import time. We set the env var before importing the module under test.
  // Since vitest caches modules, we control this via process.env before the
  // first import in each test (using vi.resetModules is needed for isolation).
  //
  // For this test suite we take a pragmatic shortcut: register the route with
  // process.env already set, and the import of books.ts will pick it up via
  // the config.ts singleton. The env var is set once per describe block.

  const app = Fastify({ logger: false });
  if (booksDir !== undefined) {
    process.env['FOUNDRY_MCP_BOOKS_DIR'] = booksDir;
  } else {
    delete process.env['FOUNDRY_MCP_BOOKS_DIR'];
  }
  registerBooksRoute(app);
  await app.ready();
  return app;
}

describe('GET /books/_index.json', () => {
  let tmpDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pdf-reader-test-'));
  });

  afterEach(async () => {
    await app?.close();
    await rm(tmpDir, { recursive: true, force: true });
    delete process.env['FOUNDRY_MCP_BOOKS_DIR'];
  });

  it('returns 404 when FOUNDRY_MCP_BOOKS_DIR is unset', async () => {
    app = await buildApp(undefined);
    const res = await app.inject({ method: 'GET', url: '/books/_index.json' });
    expect(res.statusCode).toBe(404);
  });

  it('returns an empty array for an empty directory', async () => {
    app = await buildApp(tmpDir);
    const res = await app.inject({ method: 'GET', url: '/books/_index.json' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns entries for top-level PDFs', async () => {
    await writeFile(join(tmpDir, 'Core Rulebook.pdf'), Buffer.alloc(1024));
    app = await buildApp(tmpDir);
    const res = await app.inject({ method: 'GET', url: '/books/_index.json' });
    expect(res.statusCode).toBe(200);
    const entries = JSON.parse(res.body) as BookIndexEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toBe('Core Rulebook');
    expect(entries[0]!.filename).toBe('Core Rulebook.pdf');
    expect(entries[0]!.sizeBytes).toBe(1024);
    expect(entries[0]!.category).toBeUndefined();
  });

  it('returns entries for PDFs inside category subdirectories', async () => {
    await mkdir(join(tmpDir, 'Rulebooks'));
    await writeFile(join(tmpDir, 'Rulebooks', 'Player Core.pdf'), Buffer.alloc(512));
    app = await buildApp(tmpDir);
    const res = await app.inject({ method: 'GET', url: '/books/_index.json' });
    expect(res.statusCode).toBe(200);
    const entries = JSON.parse(res.body) as BookIndexEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('Rulebooks');
    expect(entries[0]!.filename).toBe('Rulebooks/Player Core.pdf');
    expect(entries[0]!.title).toBe('Player Core');
  });

  it('includes both top-level and categorized PDFs', async () => {
    await writeFile(join(tmpDir, 'Misc Guide.pdf'), Buffer.alloc(256));
    await mkdir(join(tmpDir, 'Adventures'));
    await writeFile(join(tmpDir, 'Adventures', 'The Lost Mine.pdf'), Buffer.alloc(128));
    app = await buildApp(tmpDir);
    const res = await app.inject({ method: 'GET', url: '/books/_index.json' });
    const entries = JSON.parse(res.body) as BookIndexEntry[];
    expect(entries).toHaveLength(2);
    const categories = entries.map((e) => e.category ?? null);
    expect(categories).toContain('Adventures');
    expect(categories).toContain(null);
  });

  it('ignores non-PDF files', async () => {
    await writeFile(join(tmpDir, 'notes.txt'), 'hello');
    await writeFile(join(tmpDir, 'Book.pdf'), Buffer.alloc(64));
    app = await buildApp(tmpDir);
    const res = await app.inject({ method: 'GET', url: '/books/_index.json' });
    const entries = JSON.parse(res.body) as BookIndexEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.filename).toBe('Book.pdf');
  });
});
