import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod/v4';
import { log } from '../logger.js';
import { LiveDb } from '../db/live-db.js';
import { LIVE_DB_PATH, SHARED_SECRET } from '../config.js';
import { registerActorRoutes } from './routes/actors.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerCompendiumRoutes } from './routes/compendium.js';
import { registerDispatchRoute } from './routes/dispatch.js';
import { registerEvalRoutes } from './routes/eval.js';
import { registerEventRoutes } from './routes/events.js';
import { registerLiveRoutes } from './routes/live.js';
import { registerPromptRoutes } from './routes/prompts.js';
import { registerUploadRoutes } from './routes/uploads.js';

export async function buildHttpApp(): Promise<FastifyInstance> {
  // The parent http.Server routes `/api/*` and most other GETs into this
  // Fastify instance via `app.routing(req, res)` — see src/index.ts. The
  // parent has its own logger, so Fastify's is off to avoid double logs.
  const app = Fastify({ logger: false });

  // Permissive CORS for LAN-direct REST clients (player-portal dev server,
  // `_http/` scratchpads, etc.). In the deployed topology player-portal
  // proxies `/api/mcp/*` here so the request is same-origin from its point
  // of view.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  // Response envelope: plain JSON on 2xx, `{error, suggestion?}` on 4xx/5xx.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const suggestion = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      log.warn(`api ${req.method} ${req.url} 400 zod: ${suggestion}`);
      reply.code(400).send({ error: 'Invalid request parameters', suggestion });
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);

    if (msg.toLowerCase().includes('not connected')) {
      log.error(`api ${req.method} ${req.url} 503 ${msg}`);
      reply.code(503).send({
        error: 'Foundry module not connected',
        suggestion: 'Start Foundry and enable the foundry-api-bridge module so it can connect to this server.',
      });
      return;
    }

    if (msg.toLowerCase().includes('not found')) {
      log.info(`api ${req.method} ${req.url} 404 ${msg}`);
      reply.code(404).send({ error: msg });
      return;
    }

    if (msg.toLowerCase().includes('timed out')) {
      log.error(`api ${req.method} ${req.url} 504 ${msg}`);
      reply.code(504).send({
        error: msg,
        suggestion:
          'The Foundry module may be busy preparing data for a large world. Try again, or check the Foundry console for errors.',
      });
      return;
    }

    log.error(`api ${req.method} ${req.url} 500 ${msg}`);
    reply.code(500).send({ error: msg });
  });

  registerActorRoutes(app);
  registerAssetRoutes(app);
  registerDispatchRoute(app);
  registerCompendiumRoutes(app);
  registerEvalRoutes(app);
  registerEventRoutes(app);
  registerLiveRoutes(app, new LiveDb(LIVE_DB_PATH), SHARED_SECRET);
  registerPromptRoutes(app);
  registerUploadRoutes(app);

  // Lightweight health probe for container orchestrators (Fly/Docker
  // healthcheck). Avoids depending on /health's richer shape — just `ok`.
  app.get('/healthz', async (_req, reply) => {
    reply.type('text/plain').send('ok');
  });

  // Plain JSON 404. This server is API-only after the SPA un-bundling
  // (the SPA now lives in `apps/player-portal`), so there's no HTML
  // fallback for unknown paths.
  app.setNotFoundHandler(async (req, reply) => {
    reply.code(404).send({
      error: `Route ${req.method} ${req.url} not found`,
      suggestion: 'See available endpoints under /api/ — actors, compendium, events, prompts, uploads.',
    });
  });

  await app.ready();
  return app;
}
