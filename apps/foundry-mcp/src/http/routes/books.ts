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
import { pipeline } from 'node:stream/promises';
import { open, readdir, stat } from 'node:fs/promises';
import { join, resolve, extname, basename } from 'node:path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FOUNDRY_MCP_BOOKS_DIR } from '../../config.js';
import { log } from '../../logger.js';

export interface BookIndexEntry {
  id: string;
  filename: string;
  title: string;
  sizeBytes: number;
  mtime: number;
  category?: string;
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
      // Range request: read the exact byte slice into a Buffer and send via
      // reply.send(). Avoids streaming/hijack lifecycle issues — pdfjs chunks
      // are small (tens of KB) so in-memory reads are fine.
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
      const fd = await open(filePath, 'r');
      const buffer = Buffer.allocUnsafe(chunkSize);
      try {
        await fd.read(buffer, 0, chunkSize, start);
      } finally {
        await fd.close();
      }
      reply
        .code(206)
        .header('Content-Type', 'application/pdf')
        .header('Content-Range', `bytes ${start}-${end}/${total}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', String(chunkSize))
        .send(buffer);
    } else {
      // Full-file request: hijack + pipe. pdfjs always uses range requests for
      // large PDFs so this path is rarely hit, but keep it for completeness.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
      });
      const stream = createReadStream(filePath);
      stream.on('error', (err) => {
        log.error(`books: full-file stream error for ${filePath}: ${String(err)}`);
        if (!reply.raw.writableEnded) reply.raw.end();
      });
      stream.pipe(reply.raw);
    }
  });
}

async function buildIndex(booksRoot: string): Promise<BookIndexEntry[]> {
  const entries: BookIndexEntry[] = [];
  const rootEntries = await readdir(booksRoot, { withFileTypes: true });

  for (const entry of rootEntries) {
    if (entry.isDirectory()) {
      const category = entry.name;
      const subEntries = await readdir(join(booksRoot, category), { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isFile() || extname(sub.name).toLowerCase() !== '.pdf') continue;
        const filePath = join(booksRoot, category, sub.name);
        const s = await stat(filePath);
        entries.push(makeEntry(`${category}/${sub.name}`, sub.name, s.size, s.mtimeMs, category));
      }
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') {
      const filePath = join(booksRoot, entry.name);
      const s = await stat(filePath);
      entries.push(makeEntry(entry.name, entry.name, s.size, s.mtimeMs));
    }
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));
  return entries;
}

function makeEntry(filename: string, leafName: string, sizeBytes: number, mtime: number, category?: string): BookIndexEntry {
  const stem = basename(leafName, extname(leafName));
  // Derive a URL-safe id from the relative filename (category/name or name).
  const id = filename.replace(/[^\w/.-]/g, '_').replace(/\.pdf$/i, '');
  return { id, filename, title: stem.replace(/_/g, ' '), sizeBytes, mtime: Math.round(mtime), category };
}
