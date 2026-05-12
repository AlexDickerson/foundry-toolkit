// Serve PDF files from FOUNDRY_MCP_BOOKS_DIR over HTTP with range-request
// support so pdfjs can stream individual pages.
//
// GET /books/_index.json   — lists all PDFs in the books directory tree.
// GET /books/<path>        — serves the file at <path> within books dir.
//
// Paths may include one level of subdirectory (category/filename.pdf).
// Path traversal outside FOUNDRY_MCP_BOOKS_DIR is rejected with 400.
//
// If FOUNDRY_MCP_BOOKS_DIR is unset every route returns 404.

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve, extname, basename } from 'node:path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FOUNDRY_MCP_BOOKS_DIR } from '../../config.js';
import { log } from '../../logger.js';
import { getPf2eDb, isPf2eDbOpen } from '@foundry-toolkit/db/pf2e';

export interface BookIndexEntry {
  id: string;
  filename: string;
  title: string;
  sizeBytes: number;
  mtime: number;
  category?: string;
  system?: string;
  aiCategory?: string;
  subcategory?: string;
  publisher?: string;
  pageCount?: number;
  /** When the file matched a pf2e.db row, this is that row's integer id —
   *  use it to fetch the cover blob via GET /books/_covers/<dbId>. */
  dbId?: number;
  /** True when pf2e.db has a cover_blob for this book. */
  hasCover?: boolean;
}

interface BookDbRow {
  id: number;
  path: string;
  title: string | null;
  category: string | null;
  subcategory: string | null;
  page_count: number | null;
  ai_system: string | null;
  ai_category: string | null;
  ai_subcategory: string | null;
  ai_title: string | null;
  ai_publisher: string | null;
  has_cover: number; // 0 or 1
}

export function registerBooksRoute(app: FastifyInstance): void {
  // Cover endpoint — serves the PNG cover blob from pf2e.db by book id.
  app.get<{ Params: { id: string } }>('/books/_covers/:id', async (req, reply) => {
    if (!isPf2eDbOpen()) {
      reply.code(404).send({ error: 'pf2e.db not configured' });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || !Number.isInteger(id)) {
      reply.code(400).send({ error: 'Invalid book id' });
      return;
    }
    try {
      const row = getPf2eDb()
        .prepare('SELECT cover_blob FROM books WHERE id = ?')
        .get(id) as { cover_blob: Uint8Array | null } | undefined;
      if (!row?.cover_blob) {
        reply.code(404).send({ error: 'No cover for this book' });
        return;
      }
      reply
        .code(200)
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=86400')
        .send(Buffer.from(row.cover_blob));
    } catch (err) {
      log.error(`books: failed to read cover for id=${id}: ${String(err)}`);
      reply.code(500).send({ error: 'Failed to read cover' });
    }
  });

  // Index endpoint — lists all PDFs in the books directory tree.
  app.get('/books/_index.json', async (_req, reply) => {
    if (!FOUNDRY_MCP_BOOKS_DIR) {
      reply.code(404).send({ error: 'Books directory not configured (FOUNDRY_MCP_BOOKS_DIR unset)' });
      return;
    }

    try {
      const entries = await buildIndex(FOUNDRY_MCP_BOOKS_DIR);
      reply.type('application/json').send(entries);
    } catch (err) {
      log.error(`books index: failed to list ${FOUNDRY_MCP_BOOKS_DIR}: ${String(err)}`);
      reply.code(500).send({ error: 'Failed to read books directory' });
    }
  });

  // File serving — supports range requests for large PDFs.
  app.get('/books/*', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!FOUNDRY_MCP_BOOKS_DIR) {
      reply.code(404).send({ error: 'Books directory not configured (FOUNDRY_MCP_BOOKS_DIR unset)' });
      return;
    }

    // Extract the path after /books/ from the raw URL (preserves percent-encoding).
    const rawUrl = req.raw.url ?? '';
    const prefix = '/books/';
    const afterPrefix = rawUrl.startsWith(prefix) ? rawUrl.slice(prefix.length) : '';
    const requestedPath = decodeURIComponent(afterPrefix.split('?')[0] ?? '');

    // Reject obviously empty or _index.json (already handled above).
    if (!requestedPath || requestedPath === '_index.json') {
      reply.code(400).send({ error: 'Invalid path' });
      return;
    }

    // Resolve the absolute path and guard against directory traversal.
    const booksRoot = resolve(FOUNDRY_MCP_BOOKS_DIR);
    const filePath = resolve(booksRoot, requestedPath);
    if (!filePath.startsWith(booksRoot + '/') && filePath !== booksRoot) {
      reply.code(400).send({ error: 'Path traversal not allowed' });
      return;
    }

    let fileStats: Awaited<ReturnType<typeof stat>>;
    try {
      fileStats = await stat(filePath);
    } catch {
      reply.code(404).send({ error: `Book file not found: ${requestedPath}` });
      return;
    }

    if (!fileStats.isFile()) {
      reply.code(404).send({ error: 'Not a file' });
      return;
    }

    const total = fileStats.size;
    const rangeHeader = (req.headers as Record<string, string | undefined>)['range'];

    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (!match) {
        reply.code(416).header('Content-Range', `bytes */${total}`).send();
        return;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (start > end || end >= total) {
        reply.code(416).header('Content-Range', `bytes */${total}`).send();
        return;
      }
      const chunkSize = end - start + 1;
      const buffer = await readRange(filePath, start, end);
      reply
        .code(206)
        .header('Content-Type', 'application/pdf')
        .header('Content-Range', `bytes ${start}-${end}/${total}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', String(chunkSize))
        .send(buffer);
      return;
    }

    // Full-file request: stream the file as the response body. Returning the
    // reply tells Fastify to keep the response open until the stream ends.
    // pdfjs needs the complete file when disableAutoFetch is set — it cannot
    // navigate to the trailer via on-demand range requests.
    return reply
      .code(200)
      .header('Content-Type', 'application/pdf')
      .header('Accept-Ranges', 'bytes')
      .header('Content-Length', String(total))
      .send(createReadStream(filePath));
  });
}

/** Read bytes [start, end] (inclusive) from a file into a Buffer. Uses
 *  createReadStream which manages the fd lifecycle internally, avoiding
 *  FileHandle.close() EBADF issues seen in Node.js v25. */
function readRange(filePath: string, start: number, end: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, { start, end });
    stream.on('data', (chunk) => chunks.push(chunk as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function buildIndex(booksRoot: string): Promise<BookIndexEntry[]> {
  const entries: BookIndexEntry[] = [];
  const dbMeta = loadDbMetadata();
  await walkDir(booksRoot, '', entries, dbMeta);
  // Sort by (system, category, title) when DB metadata is available;
  // otherwise fall back to title alphabetical.
  entries.sort((a, b) => {
    const sys = (a.system ?? '').localeCompare(b.system ?? '');
    if (sys !== 0) return sys;
    const cat = (a.aiCategory ?? a.category ?? '').localeCompare(b.aiCategory ?? b.category ?? '');
    if (cat !== 0) return cat;
    return a.title.localeCompare(b.title);
  });
  return entries;
}

/** Cross-platform basename — last path component regardless of separator.
 *  Needed because pf2e.db rows may contain Windows paths even when the server
 *  runs on macOS/Linux, and node:path on POSIX won't split on '\'. */
function basenameAny(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Snapshot of pf2e.db's `books` table keyed by filename basename (lowercased).
 *  We match on basename because dm-tool stores Windows-style absolute paths
 *  that won't resolve on the server — but filenames are stable across hosts. */
function loadDbMetadata(): Map<string, BookDbRow> {
  if (!isPf2eDbOpen()) return new Map();
  try {
    const rows = getPf2eDb()
      .prepare(
        `SELECT id, path, title, category, subcategory, page_count,
                ai_system, ai_category, ai_subcategory, ai_title, ai_publisher,
                CASE WHEN cover_blob IS NULL THEN 0 ELSE 1 END AS has_cover
         FROM books`,
      )
      .all() as unknown as BookDbRow[];
    const map = new Map<string, BookDbRow>();
    for (const r of rows) {
      // pf2e.db is written by dm-tool which may have run on Windows, so paths
      // can use either separator. path.basename() on macOS only handles '/'.
      map.set(basenameAny(r.path).toLowerCase(), r);
    }
    return map;
  } catch (err) {
    log.warn(`books: could not read pf2e.db books table: ${String(err)}`);
    return new Map();
  }
}

async function walkDir(
  absPath: string,
  relPath: string,
  out: BookIndexEntry[],
  dbMeta: Map<string, BookDbRow>,
): Promise<void> {
  const dirEntries = await readdir(absPath, { withFileTypes: true });
  for (const entry of dirEntries) {
    if (entry.name.startsWith('.')) continue;
    const childAbs = join(absPath, entry.name);
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walkDir(childAbs, childRel, out, dbMeta);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') {
      const s = await stat(childAbs);
      const folderCategory = relPath ? (relPath.split('/')[0] ?? undefined) : undefined;
      const meta = dbMeta.get(entry.name.toLowerCase());
      out.push(makeEntry(childRel, entry.name, s.size, s.mtimeMs, folderCategory, meta));
    }
  }
}

function makeEntry(
  filename: string,
  leafName: string,
  sizeBytes: number,
  mtime: number,
  folderCategory: string | undefined,
  meta: BookDbRow | undefined,
): BookIndexEntry {
  const stem = basename(leafName, extname(leafName));
  const id = filename.replace(/[^\w/.-]/g, '_').replace(/\.pdf$/i, '');
  const fallbackTitle = stem.replace(/_/g, ' ');
  const entry: BookIndexEntry = {
    id,
    filename,
    title: meta?.ai_title ?? meta?.title ?? fallbackTitle,
    sizeBytes,
    mtime: Math.round(mtime),
  };
  if (folderCategory) entry.category = folderCategory;
  if (meta?.ai_system) entry.system = meta.ai_system;
  if (meta?.ai_category) entry.aiCategory = meta.ai_category;
  if (meta?.ai_subcategory) entry.subcategory = meta.ai_subcategory;
  else if (meta?.subcategory) entry.subcategory = meta.subcategory;
  if (meta?.ai_publisher) entry.publisher = meta.ai_publisher;
  if (meta?.page_count != null) entry.pageCount = meta.page_count;
  if (meta) {
    entry.dbId = meta.id;
    if (meta.has_cover) entry.hasCover = true;
  }
  return entry;
}
