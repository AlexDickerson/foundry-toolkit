import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import { registerAuthRoutes } from './auth.js';

const TEST_KEY = Buffer.alloc(32, 0xcd);
const CORRECT_PASSWORD = 'correct-portal-password';

beforeEach(() => {
  process.env['PLAYER_PORTAL_PASSWORD'] = CORRECT_PASSWORD;
});

afterEach(() => {
  delete process.env['PLAYER_PORTAL_PASSWORD'];
  delete process.env['PORTAL_AUTH_BYPASS'];
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
  it('returns 200 and sets session cookie on correct password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: CORRECT_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when PLAYER_PORTAL_PASSWORD is not set', async () => {
    delete process.env['PLAYER_PORTAL_PASSWORD'];
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'anything' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 on missing password field', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const app = await buildApp();

    // Log in first
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: CORRECT_PASSWORD },
    });
    const cookie = loginRes.headers['set-cookie'] as string;

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(200);
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

  it('returns 200 when logged in', async () => {
    const app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: CORRECT_PASSWORD },
    });
    const cookie = loginRes.headers['set-cookie'] as string;

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json<{ ok: boolean }>().ok).toBe(true);
  });

  it('returns 200 when PORTAL_AUTH_BYPASS=1', async () => {
    process.env['PORTAL_AUTH_BYPASS'] = '1';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(200);
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

    const { requireAuth } = await import('../auth/middleware.js');
    app.addHook('preHandler', requireAuth);

    await registerAuthRoutes(app);
    app.get('/api/mcp/actors', async () => ({ ok: true }));
    await app.ready();

    // 1. Unauthenticated request → 401
    const unauthed = await app.inject({ method: 'GET', url: '/api/mcp/actors' });
    expect(unauthed.statusCode).toBe(401);

    // 2. Login with correct password → 200 + cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: CORRECT_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookie = loginRes.headers['set-cookie'] as string;

    // 3. Authenticated request → 200
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

    // 5. Request without cookie → 401
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
