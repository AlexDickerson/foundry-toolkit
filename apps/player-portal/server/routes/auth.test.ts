import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashPassword, initUsers, persistUsers, type User } from '../auth/users.js';
import { registerAuthRoutes } from './auth.js';

const TEST_KEY = Buffer.alloc(32, 0xcd);

let tmpDir: string;
let tmpFile: string;
let testUser: User;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `portal-auth-routes-test-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  tmpFile = join(tmpDir, 'users.json');

  testUser = {
    id: randomUUID(),
    username: 'alice',
    passwordHash: await hashPassword('correct-password'),
    actorId: 'actor-abc',
    createdAt: new Date().toISOString(),
  };
  persistUsers([testUser], tmpFile);
  initUsers(tmpFile);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(secureSession, {
    key: TEST_KEY,
    cookieName: 'portal-session',
    cookie: { path: '/' },
  });
  await registerAuthRoutes(app);
  await app.ready();
  return app;
}

describe('POST /api/auth/login', () => {
  it('returns 200 and user (no hash) on correct credentials', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'correct-password' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ user: Record<string, unknown> }>();
    expect(body.user.username).toBe('alice');
    expect('passwordHash' in body.user).toBe(false);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unknown username', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'anything' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 on missing fields', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice' }, // missing password
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const app = await buildApp();

    // First log in to get a session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'correct-password' },
    });
    const cookie = loginRes.headers['set-cookie'] as string;

    // Then log out
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(200);
    // The session cookie should be invalidated (expires in the past or zeroed)
    const setCookie = logoutRes.headers['set-cookie'] as string | undefined;
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/Max-Age=0|Expires=.*1970/i);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when not logged in', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns user (no hash) when logged in', async () => {
    const app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'correct-password' },
    });
    const cookie = loginRes.headers['set-cookie'] as string;

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);
    const body = meRes.json<{ user: Record<string, unknown> }>();
    expect(body.user.username).toBe('alice');
    expect(body.user.actorId).toBe('actor-abc');
    expect('passwordHash' in body.user).toBe(false);
  });
});

describe('e2e: login → protected route → logout', () => {
  it('full flow works with inject()', async () => {
    const app = Fastify({ logger: false });
    await app.register(secureSession, {
      key: TEST_KEY,
      cookieName: 'portal-session',
      cookie: { path: '/' },
    });
    app.decorateRequest<User | undefined>('user', undefined);

    // Minimal auth middleware inline for this e2e test
    const { requireAuth } = await import('../auth/middleware.js');
    app.addHook('preHandler', requireAuth);

    await registerAuthRoutes(app);
    app.get('/api/mcp/actors', async (req) => ({ ok: true, user: (req as { user?: { username?: string } }).user?.username }));
    await app.ready();

    // 1. Unauthenticated request to protected route → 401
    const unauthed = await app.inject({ method: 'GET', url: '/api/mcp/actors' });
    expect(unauthed.statusCode).toBe(401);

    // 2. Login with correct credentials → 200 + cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'correct-password' },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookie = loginRes.headers['set-cookie'] as string;

    // 3. Authenticated request to protected route → 200
    const authed = await app.inject({
      method: 'GET',
      url: '/api/mcp/actors',
      headers: { cookie },
    });
    expect(authed.statusCode).toBe(200);

    // 4. Logout → cookie cleared
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(200);

    // 5. After logout, a request WITHOUT a cookie → 401
    // Note: stateless cookie sessions cannot be server-side invalidated.
    // Logout works by sending the browser an expired Set-Cookie header;
    // the browser drops the cookie. If the client re-sends the old cookie
    // (bypassing browser cookie management) the server will still accept it —
    // this is expected and documented behaviour for @fastify/secure-session.
    const postLogoutNoCookie = await app.inject({
      method: 'GET',
      url: '/api/mcp/actors',
      // no cookie header
    });
    expect(postLogoutNoCookie.statusCode).toBe(401);
  });
});
