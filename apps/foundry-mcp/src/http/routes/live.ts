// Live-state snapshot routes: GET / POST / SSE stream for inventory, aurus,
// and globe. These are the foundry-mcp side of the migration; dm-tool will
// begin dual-writing to these endpoints in PR 3, and player-portal's SPA will
// switch to the SSE streams in PR 4.
//
// Auth: GET and SSE streams are public (players need them; nothing private
// lives in these feeds). POST requires `Authorization: Bearer <SHARED_SECRET>`.
// When SHARED_SECRET is unset all POSTs are open — acceptable for local-only
// deployment; the caller (registerLiveRoutes) logs a warning at startup.

import type { FastifyInstance } from 'fastify';
import { inventorySnapshotSchema, aurusSnapshotSchema, globeSnapshotSchema } from '../schemas.js';
import type { LiveDb } from '../../db/live-db.js';
import { log } from '../../logger.js';

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export function registerLiveRoutes(app: FastifyInstance, db: LiveDb, secret: string | undefined): void {
  if (!secret) {
    log.warn('SHARED_SECRET is not set — live-state POST endpoints are open to all callers');
  }

  function checkAuth(authHeader: string | undefined): boolean {
    if (!secret) return true;
    return authHeader === `Bearer ${secret}`;
  }

  // ─── Inventory ─────────────────────────────────────────────────────────────

  app.get('/api/live/inventory', async () => db.getInventory());

  app.post('/api/live/inventory', async (req, reply) => {
    if (!checkAuth(req.headers.authorization)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    const snapshot = inventorySnapshotSchema.parse(req.body);
    db.setInventory(snapshot);
    log.info(`live inventory updated: ${snapshot.items.length} item(s), updatedAt=${snapshot.updatedAt}`);
    reply.code(200).send(snapshot);
  });

  app.get('/api/live/inventory/stream', (req, reply) => {
    reply.raw.writeHead(200, sseHeaders());
    reply.raw.write(`: connected\n\n`);
    reply.raw.write(`data: ${JSON.stringify(db.getInventory())}\n\n`);

    const unsubscribe = db.subscribeInventory((snapshot) => {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 20_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ─── Aurus ─────────────────────────────────────────────────────────────────

  app.get('/api/live/aurus', async () => db.getAurus());

  app.post('/api/live/aurus', async (req, reply) => {
    if (!checkAuth(req.headers.authorization)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    const snapshot = aurusSnapshotSchema.parse(req.body);
    db.setAurus(snapshot);
    log.info(`live aurus updated: ${snapshot.teams.length} team(s), updatedAt=${snapshot.updatedAt}`);
    reply.code(200).send(snapshot);
  });

  app.get('/api/live/aurus/stream', (req, reply) => {
    reply.raw.writeHead(200, sseHeaders());
    reply.raw.write(`: connected\n\n`);
    reply.raw.write(`data: ${JSON.stringify(db.getAurus())}\n\n`);

    const unsubscribe = db.subscribeAurus((snapshot) => {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 20_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ─── Globe ─────────────────────────────────────────────────────────────────

  app.get('/api/live/globe', async () => db.getGlobe());

  app.post('/api/live/globe', async (req, reply) => {
    if (!checkAuth(req.headers.authorization)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    const snapshot = globeSnapshotSchema.parse(req.body);
    db.setGlobe(snapshot);
    log.info(`live globe updated: ${snapshot.pins.length} pin(s), updatedAt=${snapshot.updatedAt}`);
    reply.code(200).send(snapshot);
  });

  app.get('/api/live/globe/stream', (req, reply) => {
    reply.raw.writeHead(200, sseHeaders());
    reply.raw.write(`: connected\n\n`);
    reply.raw.write(`data: ${JSON.stringify(db.getGlobe())}\n\n`);

    const unsubscribe = db.subscribeGlobe((snapshot) => {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 20_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
