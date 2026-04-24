import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { FOUNDRY_DATA_DIR } from '../../config.js';
import { uploadAssetBody } from '../schemas.js';

// POST /api/uploads — mirrors the `upload_asset` MCP tool but over HTTP
// so the player-portal SPA can deposit user-selected files (sheet
// backgrounds, portraits, etc.) into the Foundry Data directory. Once
// written, the file is reachable through the same /systems, /modules,
// /worlds asset prefixes the rest of the UI already fetches through —
// Foundry's own web server or our asset-proxy serves it depending on
// deployment.
// Upper bound for a single upload body. Base64 inflates binary by ~33%,
// so 16 MiB of envelope accommodates roughly a 12 MiB source image —
// comfortably larger than the largest portraits Foundry itself distributes
// while keeping a lid on accidental giant-file uploads.
const UPLOAD_BODY_LIMIT = 16 * 1024 * 1024;

export function registerUploadRoutes(app: FastifyInstance): void {
  app.post('/api/uploads', { bodyLimit: UPLOAD_BODY_LIMIT }, async (req, reply) => {
    const body = uploadAssetBody.parse(req.body);

    // Reject any path that tries to escape the Data dir — either via a
    // leading `..`, a mid-path `..`, or an absolute path that resolves
    // outside FOUNDRY_DATA_DIR after normalisation.
    const safeRel = normalize(body.path);
    if (safeRel.startsWith('..') || safeRel.includes('/..') || safeRel.includes('\\..')) {
      reply.code(400).send({
        error: 'path must not escape the Data directory',
        suggestion: 'Use a relative path like "modules/character-creator-bg/<actor>.png".',
      });
      return;
    }
    const absPath = resolve(FOUNDRY_DATA_DIR, safeRel);
    if (!absPath.startsWith(FOUNDRY_DATA_DIR)) {
      reply.code(400).send({ error: 'path must resolve inside the Data directory' });
      return;
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(body.dataBase64, 'base64');
    } catch {
      reply.code(400).send({ error: 'dataBase64 is not valid base64' });
      return;
    }

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buf);

    return { path: safeRel, bytes: buf.length };
  });
}
