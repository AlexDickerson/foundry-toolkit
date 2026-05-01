import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import { requireAuth } from './middleware.js';
import { initUsers, persistUsers, type User } from './users.js';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// 32-byte test key (not used in production)
const TEST_KEY = Buffer.alloc(32, 0xab);

const TEST_USER: User = {
  id: 'test-uid',
  username: 'testuser',
  passwordHash: '$2b$12$fakehash',
  actorId: '',
  createdAt: '',
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `portal-mw-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  initUsers(join(tmpDir, 'users.json')); // empty in-memory cache
});

async function buildTestApp(seedUsers: User[] = []) {
  if (seedUsers.length > 0) {
    persistUsers(seedUsers, join(tmpDir, 'users.json'));
  }

  const app = Fastify({ logger: false });
  await app.register(secureSession, {
    key: TEST_KEY,
    cookieName: 'portal-session',
    cookie: { path: '/' },
  });
  app.decorateRequest<User | undefined>('user', undefined);
  app.addHook('preHandler', requireAuth);
  app.get('/api/mcp/actors', async (req) => ({ ok: true, user: req.user?.username ?? null }));
  app.get('/api/auth/me', async () => ({ ok: true })); // public — middleware skips this
  app.get('/', async () => ({ page: 'home' })); // SPA route — middleware skips this

  await app.ready();
  return app;
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

  it('200s with a valid session cookie and populates request.user', async () => {
    const app = await buildTestApp([TEST_USER]);

    // Build a valid session cookie by logging in via the session api
    const loginApp = Fastify({ logger: false });
    await loginApp.register(secureSession, {
      key: TEST_KEY,
      cookieName: 'portal-session',
      cookie: { path: '/' },
    });
    loginApp.post('/set-session', async (req, reply) => {
      req.session.set('userId', TEST_USER.id);
      await reply.send({ ok: true });
    });
    await loginApp.ready();
    const setRes = await loginApp.inject({ method: 'POST', url: '/set-session' });
    const cookie = setRes.headers['set-cookie'] as string;

    const res = await app.inject({
      method: 'GET',
      url: '/api/mcp/actors',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: string | null }>();
    expect(body.user).toBe('testuser');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('401s when session references a non-existent user', async () => {
    const app = await buildTestApp([]); // no users seeded

    const loginApp = Fastify({ logger: false });
    await loginApp.register(secureSession, {
      key: TEST_KEY,
      cookieName: 'portal-session',
      cookie: { path: '/' },
    });
    loginApp.post('/set-session', async (req, reply) => {
      req.session.set('userId', 'deleted-user-id');
      await reply.send({ ok: true });
    });
    await loginApp.ready();
    const setRes = await loginApp.inject({ method: 'POST', url: '/set-session' });
    const cookie = setRes.headers['set-cookie'] as string;

    const res = await app.inject({
      method: 'GET',
      url: '/api/mcp/actors',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(401);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
