import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashPassword, initUsers, persistUsers, type User } from '../auth/users.js';
import { requireAuth } from '../auth/middleware.js';
import { registerAuthRoutes } from './auth.js';

const TEST_KEY = Buffer.alloc(32, 0xcd);

let tmpDir: string;
let tmpFile: string;
let testUser: User;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `portal-notes-test-${randomUUID()}`);
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

// Minimal app with session + auth middleware + auth routes + stub /notes/* handler.
// Tests verify that /notes/* is gated before any upstream connection attempt.
async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(secureSession, {
    key: TEST_KEY,
    cookieName: 'portal-session',
    cookie: { path: '/' },
  });
  app.decorateRequest<User | undefined>('user', undefined);
  app.addHook('preHandler', requireAuth);
  await registerAuthRoutes(app);

  // Stub notes routes so successful auth has somewhere to land
  app.get('/notes/', async () => ({ ok: true }));
  app.get('/notes/*', async () => ({ ok: true }));

  await app.ready();
  return app;
}

describe('/notes/* auth gating', () => {
  it('returns 401 for unauthenticated request to /notes/', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notes/' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated request to a nested note path', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notes/session-1/encounter' });
    expect(res.statusCode).toBe(401);
  });

  it('passes through to the route when authenticated', async () => {
    const app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'correct-password' },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookie = loginRes.headers['set-cookie'] as string;

    const notesRes = await app.inject({
      method: 'GET',
      url: '/notes/',
      headers: { cookie },
    });
    expect(notesRes.statusCode).toBe(200);
  });
});
