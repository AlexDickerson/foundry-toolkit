import type { FastifyInstance } from 'fastify';
import { findById, findByUsername, hashPassword, toPublic, verifyPassword } from '../auth/users.js';

interface LoginBody {
  username: string;
  password: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    const user = findByUsername(username);
    if (user === undefined) {
      // Still run bcrypt to prevent timing-based username enumeration
      await hashPassword('__timing_dummy__');
      await reply.code(401).send({ error: 'invalid credentials' });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await reply.code(401).send({ error: 'invalid credentials' });
      return;
    }

    request.session.set('userId', user.id);
    await reply.code(200).send({ user: toPublic(user) });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (request, reply) => {
    request.session.delete();
    await reply.code(200).send({ ok: true });
  });

  // GET /api/auth/me — returns the current user without the password hash
  app.get('/api/auth/me', async (request, reply) => {
    const userId = request.session.get('userId');
    if (userId === undefined) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    const user = findById(userId);
    if (user === undefined) {
      request.session.delete();
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    await reply.code(200).send({ user: toPublic(user) });
  });
}
