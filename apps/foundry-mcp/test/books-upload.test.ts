import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { openPf2eDb, closePf2eDb, getPf2eDb } from '@foundry-toolkit/db/pf2e';
import { registerBooksRoute } from '../src/http/routes/books.js';

// Minimal valid PDF header.
const FAKE_PDF = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(32, 0x20)]);
const NOT_PDF = Buffer.from('Not a PDF file!!!!');

function buildMultipart(
  fields: Array<{ name: string; value: string }>,
  files: Array<{ name: string; filename: string; content: Buffer; contentType?: string }>,
): { body: Buffer; contentType: string } {
  const boundary = 'TestBoundary' + Date.now().toString(36);
  const crlf = '\r\n';
  const parts: Buffer[] = [];
  for (const f of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="${f.name}"${crlf}${crlf}${f.value}${crlf}`,
      ),
    );
  }
  for (const f of files) {
    const ct = f.contentType ?? 'application/octet-stream';
    parts.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="${f.name}"; filename="${f.filename}"${crlf}Content-Type: ${ct}${crlf}${crlf}`,
      ),
    );
    parts.push(f.content);
    parts.push(Buffer.from(crlf));
  }
  parts.push(Buffer.from(`--${boundary}--${crlf}`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

let tmpBooksDir: string;
let app: ReturnType<typeof Fastify>;

describe('POST /books/upload', () => {
  before(async () => {
    tmpBooksDir = await mkdtemp(join(tmpdir(), 'books-upload-'));
    const dbPath = join(tmpdir(), `books-upload-${process.pid}.db`);
    process.env['FOUNDRY_MCP_BOOKS_DIR'] = tmpBooksDir;
    openPf2eDb(dbPath);
    // Create the books table (BookDb migration is dm-tool territory; just create it inline).
    getPf2eDb().exec(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        subcategory TEXT,
        ruleset TEXT,
        page_count INTEGER,
        file_size INTEGER NOT NULL,
        cover_blob BLOB,
        mtime INTEGER NOT NULL,
        ingested_at INTEGER,
        ai_system TEXT, ai_category TEXT, ai_subcategory TEXT,
        ai_title TEXT, ai_publisher TEXT, ai_classified_at INTEGER
      )
    `);
    app = Fastify({ logger: false });
    await app.register(multipart);
    registerBooksRoute(app);
    await app.ready();
  });

  after(async () => {
    await app.close();
    closePf2eDb();
    delete process.env['FOUNDRY_MCP_BOOKS_DIR'];
    await rm(tmpBooksDir, { recursive: true, force: true });
  });

  it('round-trips: file lands on disk and db row has correct shape', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'category', value: 'Rulebooks' },
        { name: 'title', value: 'Core Rules' },
      ],
      [{ name: 'file', filename: 'core-rules.pdf', content: FAKE_PDF, contentType: 'application/pdf' }],
    );
    const res = await app.inject({
      method: 'POST',
      url: '/books/upload',
      headers: { 'content-type': contentType },
      body,
    });
    assert.equal(res.statusCode, 200, `body: ${res.body}`);
    const json = JSON.parse(res.body) as { id: number; title: string; category: string; sizeBytes: number };
    assert.equal(json.title, 'Core Rules');
    assert.equal(json.category, 'Rulebooks');
    assert.ok(json.sizeBytes > 0);
    // File exists on disk.
    await access(join(tmpBooksDir, 'Rulebooks', 'core-rules.pdf'));
    // DB row exists.
    const row = getPf2eDb().prepare('SELECT * FROM books WHERE id = ?').get(json.id);
    assert.ok(row);
  });

  it('returns 415 for non-PDF magic bytes', async () => {
    const { body, contentType } = buildMultipart(
      [{ name: 'category', value: 'Test' }],
      [{ name: 'file', filename: 'bad.pdf', content: NOT_PDF, contentType: 'application/pdf' }],
    );
    const res = await app.inject({
      method: 'POST',
      url: '/books/upload',
      headers: { 'content-type': contentType },
      body,
    });
    assert.equal(res.statusCode, 415);
  });

  it('returns 409 on duplicate filename', async () => {
    const { body: b1, contentType: ct1 } = buildMultipart(
      [
        { name: 'category', value: 'Dupes' },
        { name: 'title', value: 'Same Book' },
      ],
      [{ name: 'file', filename: 'same.pdf', content: FAKE_PDF }],
    );
    await app.inject({ method: 'POST', url: '/books/upload', headers: { 'content-type': ct1 }, body: b1 });
    const { body: b2, contentType: ct2 } = buildMultipart(
      [
        { name: 'category', value: 'Dupes' },
        { name: 'title', value: 'Same Book' },
      ],
      [{ name: 'file', filename: 'same.pdf', content: FAKE_PDF }],
    );
    const res = await app.inject({
      method: 'POST',
      url: '/books/upload',
      headers: { 'content-type': ct2 },
      body: b2,
    });
    assert.equal(res.statusCode, 409);
  });

  it('sanitizes path traversal in category', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'category', value: '../../../evil' },
        { name: 'title', value: 'Evil Book' },
      ],
      [{ name: 'file', filename: 'evil.pdf', content: FAKE_PDF }],
    );
    const res = await app.inject({
      method: 'POST',
      url: '/books/upload',
      headers: { 'content-type': contentType },
      body,
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body) as { category: string };
    // Category must not contain .. or slashes.
    assert.ok(!json.category.includes('..'));
    assert.ok(!json.category.includes('/'));
    assert.ok(!json.category.includes('\\'));
  });
});
