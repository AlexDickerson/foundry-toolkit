import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, normalize, resolve } from 'node:path';
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

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);

export function registerUploadRoutes(app: FastifyInstance, opts: { dataDir?: string } = {}): void {
  const dataDir = opts.dataDir ?? FOUNDRY_DATA_DIR;
  app.post('/api/uploads', { bodyLimit: UPLOAD_BODY_LIMIT }, async (req, reply) => {
    const body = uploadAssetBody.parse(req.body);

    // Reject any path that tries to escape the Data dir — either via a
    // leading `..`, a mid-path `..`, or an absolute path that resolves
    // outside dataDir after normalisation.
    const safeRel = normalize(body.path);
    if (safeRel.startsWith('..') || safeRel.includes('/..') || safeRel.includes('\\..')) {
      reply.code(400).send({
        error: 'path must not escape the Data directory',
        suggestion: 'Use a relative path like "modules/character-creator-bg/<actor>.png".',
      });
      return;
    }
    const absPath = resolve(dataDir, safeRel);
    if (!absPath.startsWith(dataDir)) {
      reply.code(400).send({ error: 'path must resolve inside the Data directory' });
      return;
    }

    const ext = extname(safeRel).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      reply.code(400).send({
        error: `File type "${ext || '(none)'}" is not allowed`,
        suggestion: 'Upload a PNG, JPG, WebP, GIF, AVIF, or SVG image.',
      });
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

    // Always return forward slashes regardless of platform so the stored
    // path is a valid URL segment on every OS.
    return { path: safeRel.replace(/\\/g, '/'), bytes: buf.length };
  });
}
