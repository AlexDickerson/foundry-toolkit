import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod/v4';
import { registerUploadRoutes } from '../src/http/routes/uploads.js';

// 1×1 transparent PNG (minimal valid image bytes)
const PNG_1PX_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeApp(dataDir: string): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: 'Invalid request parameters' });
      return;
    }
    reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
  });
  registerUploadRoutes(app, { dataDir });
  return app;
}

describe('POST /api/uploads — path separator', () => {
  let tmpDir: string;
  let app: FastifyInstance;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-routes-test-'));
    app = makeApp(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns forward-slash path regardless of platform', async () => {
    // Regression: path.normalize on Windows converts forward slashes to
    // backslashes. The returned path was stored verbatim in the actor flag
    // and rendered as a broken background URL on the sheet.
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        path: 'modules/character-creator-bg/actor-123-1234567890.png',
        dataBase64: PNG_1PX_B64,
      }),
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { path: string; bytes: number };
    assert.ok(!body.path.includes('\\'), `path must not contain backslashes, got: ${body.path}`);
    assert.match(body.path, /^modules\/character-creator-bg\//);
  });

  it('rejects paths that escape the data directory', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        path: '../escape/evil.png',
        dataBase64: PNG_1PX_B64,
      }),
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects missing path field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ dataBase64: PNG_1PX_B64 }),
    });
    assert.equal(res.statusCode, 400);
  });

  it('rejects non-image file extensions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        path: 'modules/character-creator-bg/evil.txt',
        dataBase64: Buffer.from('not an image').toString('base64'),
      }),
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload) as { error: string };
    assert.match(body.error, /not allowed/);
  });

  it('accepts WebP uploads', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        path: 'modules/character-creator-bg/actor-123.webp',
        dataBase64: PNG_1PX_B64,
      }),
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { path: string };
    assert.match(body.path, /\.webp$/);
  });
});
