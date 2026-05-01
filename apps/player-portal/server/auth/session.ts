import type { FastifyInstance } from 'fastify';
import secureSession from '@fastify/secure-session';

declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string;
  }
}

export async function registerSession(app: FastifyInstance): Promise<void> {
  const secret = process.env['SECURE_SESSION_SECRET'];
  if (!secret) throw new Error('SECURE_SESSION_SECRET env var is required');

  // @fastify/secure-session stores the entire payload in an encrypted, signed
  // cookie (libsodium secret-key box). No server-side store needed. The cookie
  // survives server restarts; rotating SECURE_SESSION_SECRET invalidates all sessions.
  await app.register(secureSession, {
    key: Buffer.from(secret, 'hex'), // SECURE_SESSION_SECRET is a 64-char hex = 32 bytes
    cookieName: 'portal-session',
    cookie: {
      path: '/',
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
  });
}
