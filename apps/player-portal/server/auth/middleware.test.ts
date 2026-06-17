import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import { requireAuth } from './middleware.js';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// 32-byte test key (not used in production)
const TEST_KEY = Buffer.alloc(32, 0xab);

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `portal-mw-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
});

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(secureSession, {
    key: TEST_KEY,
    cookieName: 'portal-session',
    cookie: { path: '/' },
  });
  app.addHook('preHandler', requireAuth);
  app.get('/api/mcp/actors', async () => ({ ok: true }));
  app.get('/api/auth/me', async () => ({ ok: true })); // public — middleware skips this
  app.get('/', async () => ({ page: 'home' })); // SPA route — middleware skips this

  await app.ready();
  return app;
}

/** Build a valid session cookie by setting authenticated=true in a helper app. */
async function makeAuthCookie(value: boolean): Promise<string> {
  const helperApp = Fastify({ logger: false });
  await helperApp.register(secureSession, {
    key: TEST_KEY,
    cookieName: 'portal-session',
    cookie: { path: '/' },
  });
  helperApp.post('/set-session', async (req, reply) => {
    req.session.set('authenticated', value);
    await reply.send({ ok: true });
  });
  await helperApp.ready();
  const res = await helperApp.inject({ method: 'POST', url: '/set-session' });
  return res.headers['set-cookie'] as string;
}

describe('requireAuth', () => {
  it('401s on /api/mcp/* without a session cookie', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/mcp/actors' });
    expect(res.statusCode).toBe(401);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes through /api/auth/* without a session', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(200);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes through SPA routes without a session', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('200s with a valid authenticated session cookie', async () => {
    const app = await buildTestApp();
    const cookie = await makeAuthCookie(true);

    const res = await app.inject({
      method: 'GET',
      url: '/api/mcp/actors',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('401s when session has authenticated=false', async () => {
    const app = await buildTestApp();
    const cookie = await makeAuthCookie(false);

    const res = await app.inject({
      method: 'GET',
      url: '/api/mcp/actors',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(401);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
