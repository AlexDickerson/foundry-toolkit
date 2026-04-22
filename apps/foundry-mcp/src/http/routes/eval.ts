import type { FastifyInstance } from 'fastify';
import { sendCommand } from '../../bridge.js';
import { ALLOW_EVAL } from '../../config.js';
import { log } from '../../logger.js';
import { evalBody } from '../schemas.js';

// Dev-only escape hatch: POST /api/eval runs arbitrary JS in the Foundry
// page and returns whatever it returns. Gated on ALLOW_EVAL — when the flag
// is off, the route is never registered, so a request 404s via our standard
// not-found handler (same response shape as any other unknown endpoint).
export function registerEvalRoutes(app: FastifyInstance): void {
  if (!ALLOW_EVAL) return;

  log.warn('eval endpoint enabled — POST /api/eval accepts arbitrary JS');

  app.post('/api/eval', async (req) => {
    const { script } = evalBody.parse(req.body);
    return sendCommand('run-script', { script });
  });
}
