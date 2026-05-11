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
  /** Display title — prefers AI-cleaned title from pf2e.db, falls back to
   *  the filename stem. */
  title: string;
  sizeBytes: number;
  mtime: number;
  /** Top-level folder under FOUNDRY_MCP_BOOKS_DIR. Used as a default
   *  grouping when DB metadata isn't available. */
  category?: string;
  /** AI-classified system (PF2e, 5e, Generic, …). Populated from pf2e.db. */
  system?: string;
  /** AI-classified category (Rulebook, Adventure Path, …). When set this
   *  overrides the filesystem-derived `category`. */
  aiCategory?: string;
  /** AI-classified subcategory (e.g. AP name "Abomination Vaults"). */
  subcategory?: string;
  /** AI-classified publisher (Paizo, WotC, etc.). */
  publisher?: string;
  /** Cached page count from prior ingest, if available. */
  pageCount?: number;
}

/** Subset of `books` columns we read for catalog enrichment. */
interface BookDbRow {
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
}

export function registerBooksRoute(app: FastifyInstance): void {
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

/** Snapshot of pf2e.db's `books` table keyed by filename basename (lowercased).
 *  We match on basename because dm-tool stores Windows-style absolute paths
 *  that won't resolve on the server — but filenames are stable across hosts. */
function loadDbMetadata(): Map<string, BookDbRow> {
  if (!isPf2eDbOpen()) return new Map();
  try {
    const rows = getPf2eDb()
      .prepare(
        `SELECT path, title, category, subcategory, page_count,
                ai_system, ai_category, ai_subcategory, ai_title, ai_publisher
         FROM books`,
      )
      .all() as unknown as BookDbRow[];
    const map = new Map<string, BookDbRow>();
    for (const r of rows) {
      // basename() handles both / and \ separators, so Windows paths work.
      map.set(basename(r.path).toLowerCase(), r);
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
  return entry;
}
