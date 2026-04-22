import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod/v4';
import { resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { log } from '../logger.js';
import { registerActorRoutes } from './routes/actors.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerCompendiumRoutes } from './routes/compendium.js';
import { registerEvalRoutes } from './routes/eval.js';
import { registerPromptRoutes } from './routes/prompts.js';

// Directory on disk containing the built character-creator SPA.
// In the container image this is `/app/public`; for local dev (where the SPA
// isn't bundled in) we fall back to `./public` — missing dir is fine, the
// static plugin tolerates it and the SPA fallback simply won't fire.
const STATIC_ROOT = process.env.STATIC_ROOT ?? resolve(process.cwd(), 'public');

export async function buildHttpApp(): Promise<FastifyInstance> {
  // The parent http.Server routes `/api/*` and most other GETs into this
  // Fastify instance via `app.routing(req, res)` — see src/index.ts. The
  // parent has its own logger, so Fastify's is off to avoid double logs.
  const app = Fastify({ logger: false });

  // Permissive CORS. Same-origin in the unified-container deploy, but kept
  // for LAN-direct REST clients (the character-creator dev server, `_http/`
  // scratchpads, etc.).
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

  // NOTE: route registration order matters. /api/* and /healthz are
  // registered BEFORE @fastify/static so they take precedence over the
  // static plugin's wildcard catch-all. The asset-proxy prefixes
  // (/icons, /systems, /modules, /worlds, /ui) must also register
  // before @fastify/static so they beat the SPA fallback.
  registerActorRoutes(app);
  registerAssetRoutes(app);
  registerCompendiumRoutes(app);
  registerEvalRoutes(app);
  registerPromptRoutes(app);

  // Lightweight health probe for container orchestrators (Fly/Docker
  // healthcheck). Avoids depending on /health's richer shape — just `ok`.
  app.get('/healthz', async (_req, reply) => {
    reply.type('text/plain').send('ok');
  });

  // Serve the character-creator SPA static bundle. In production this dir
  // comes from `COPY --from=ghcr.io/.../foundry-character-creator` in the
  // Dockerfile. `wildcard: false` prevents the plugin from handling
  // arbitrary unmatched paths — we want SPA fallback (below) to catch those
  // instead of returning the plugin's own 404.
  await app.register(fastifyStatic, {
    root: STATIC_ROOT,
    prefix: '/',
    wildcard: false,
    decorateReply: false,
  });

  // Not-found handler. For API calls we stick to the JSON envelope; for
  // other GETs we fall back to the SPA index (client-side routing). Any
  // non-GET method on an unknown path is a 404 — POST/PUT/DELETE on
  // unknown routes should not be rewritten to HTML.
  app.setNotFoundHandler(async (req, reply) => {
    const isApi = req.url.startsWith('/api/') || req.url === '/api';
    const isGet = req.method === 'GET';

    if (isApi || !isGet) {
      reply.code(isApi ? 404 : 404).send({
        error: `Route ${req.method} ${req.url} not found`,
        suggestion: 'See available endpoints under /api/ — actors, compendium.',
      });
      return;
    }

    // SPA fallback — stream index.html. If the bundle isn't present (local
    // dev without the SPA baked in) return a clear 404.
    const indexPath = resolve(STATIC_ROOT, 'index.html');
    try {
      await stat(indexPath);
    } catch {
      reply.code(404).send({
        error: 'SPA bundle not present',
        suggestion:
          'Either run with the production container image (which bundles the character-creator SPA at /app/public) or set STATIC_ROOT to a directory containing index.html.',
      });
      return;
    }

    reply.type('text/html').send(createReadStream(indexPath));
  });

  await app.ready();
  return app;
}
