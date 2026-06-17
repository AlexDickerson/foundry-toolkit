import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { isBypassActive } from '../auth/middleware.js';

function checkPassword(submitted: string): boolean {
  const stored = process.env['PLAYER_PORTAL_PASSWORD'] ?? '';
  if (!stored) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(stored);
  // timingSafeEqual requires equal-length buffers — length mismatch is itself the answer
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post<{ Body: { password: string } }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { password } = request.body;
    if (!checkPassword(password)) {
      await reply.code(401).send({ error: 'incorrect password' });
      return;
    }
    request.session.set('authenticated', true);
    await reply.code(200).send({ ok: true });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (request, reply) => {
    request.session.delete();
    await reply.code(200).send({ ok: true });
  });

  // GET /api/auth/me — 200 if the session is authenticated, 401 otherwise
  app.get('/api/auth/me', async (request, reply) => {
    if (isBypassActive()) {
      await reply.code(200).send({ ok: true });
      return;
    }
    const authenticated = request.session.get('authenticated');
    if (!authenticated) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    await reply.code(200).send({ ok: true });
  });
}
