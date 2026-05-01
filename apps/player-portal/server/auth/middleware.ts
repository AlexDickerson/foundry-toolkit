import type { FastifyRequest, FastifyReply } from 'fastify';
import { type User, findById } from './users.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | undefined;
  }
}

// Routes that are always public — no session required.
// Auth routes, health, and Vite-built SPA chunks (/assets/).
const PUBLIC_PREFIXES = ['/api/auth/', '/health', '/assets/'];

// Route prefixes that gate on a valid session.
// SPA HTML routes (e.g. /, /globe, /login) are left unmatched so index.html
// is served; the client-side auth guard then redirects to /login as needed.
const GATED_PREFIXES = ['/api/', '/map/', '/icons/', '/systems/', '/modules/', '/worlds/'];

function isPublic(url: string): boolean {
  return PUBLIC_PREFIXES.some((p) => url === p.slice(0, -1) || url.startsWith(p));
}

function isGated(url: string): boolean {
  return GATED_PREFIXES.some((p) => url.startsWith(p));
}

/** Synthetic user injected when PORTAL_AUTH_BYPASS=1. Not stored in users.json. */
export const DEV_BYPASS_USER: User = {
  id: '__dev__',
  username: 'dev',
  passwordHash: '',
  actorId: '',
  createdAt: '',
};

export function isBypassActive(): boolean {
  return process.env['PORTAL_AUTH_BYPASS'] === '1';
}

/** Global preHandler hook — must be registered after the session plugin. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  request.user = undefined;

  const url = request.url.split('?')[0] ?? '';

  if (isPublic(url)) return;
  if (!isGated(url)) return; // SPA HTML routes — serve normally, client handles redirect

  // Dev bypass: skip cookie check and inject a synthetic user
  if (isBypassActive()) {
    request.user = DEV_BYPASS_USER;
    return;
  }

  const userId = request.session.get('userId');
  if (userId === undefined) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  const user = findById(userId);
  if (user === undefined) {
    // Session refers to a deleted user — clear it
    request.session.delete();
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  request.user = user;
}
