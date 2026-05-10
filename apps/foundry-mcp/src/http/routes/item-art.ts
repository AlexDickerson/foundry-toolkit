// Serve purchased PF2e item-card art files over HTTP so player-portal can
// display them in the character-sheet view.
//
// Files are served from FOUNDRY_MCP_ITEM_ART_DIR. If that env var is unset
// the route is still registered but returns 404 for every request — this
// keeps the server fully operational even when the art directory hasn't been
// synced to the host yet.
//
// We read req.raw.url (the unmodified request line from the client) instead of
// Fastify-decoded params so filenames containing percent-encoded sequences like
// %26 survive the round-trip intact. Filenames on disk use the URL-encoded
// form (e.g. Acid+Flask+-+Greater.png, Guns+%26+Gears.png) and the browser
// preserves %XX encoding in request paths, so raw-URL matching always agrees
// with what's on disk.

import { readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { FOUNDRY_MCP_ITEM_ART_DIR } from '../../config.js';
import { log } from '../../logger.js';

export function registerItemArtRoute(app: FastifyInstance): void {
  app.get('/item-art/*', async (req, reply) => {
    if (!FOUNDRY_MCP_ITEM_ART_DIR) {
      reply.code(404).send({ error: 'Item art directory not configured (FOUNDRY_MCP_ITEM_ART_DIR unset)' });
      return;
    }

    // Extract filename from the raw URL, preserving percent-encoded sequences.
    const rawUrl = req.raw.url ?? '';
    const prefix = '/item-art/';
    const afterPrefix = rawUrl.startsWith(prefix) ? rawUrl.slice(prefix.length) : '';
    // Strip query string if present.
    const rawFilename = afterPrefix.split('?')[0] ?? '';

    // Guard against path traversal: accept only a single filename component.
    // basename() strips any directory separators, and we reject empties.
    const filename = basename(rawFilename);
    if (!filename || filename !== rawFilename) {
      reply.code(400).send({ error: 'Invalid filename' });
      return;
    }

    const filePath = join(FOUNDRY_MCP_ITEM_ART_DIR, filename);
    try {
      await stat(filePath);
    } catch {
      reply.code(404).send({ error: `Art file not found: ${filename}` });
      return;
    }

    try {
      const data = await readFile(filePath);
      // Sniff the actual format from magic bytes — many "PNG" filenames in
      // the user's collection are actually WebP bytes saved with a .png
      // extension. Trusting the extension would set Content-Type: image/png
      // and many browsers refuse to render the WebP payload, leaving a blank
      // image element.
      reply.type(detectImageType(data)).send(data);
    } catch (err) {
      log.error(`item-art: failed to read ${filePath}: ${String(err)}`);
      reply.code(500).send({ error: 'Failed to read art file' });
    }
  });
}

function detectImageType(buf: Buffer): string {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // WebP: "RIFF????WEBP" (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}
