// POST /api/dispatch — generic Foundry method dispatcher.
//
// Accepts { class, id, method, args } and routes to the bridge's 'dispatch'
// command, which resolves game[collection].get(id)[method](...args) inside the
// Foundry module.  See apps/foundry-api-bridge/src/commands/handlers/dispatch/
// for the full marshaling spec.

import type { FastifyInstance } from 'fastify';
import { sendCommand } from '../../bridge.js';
import { dispatchRequestSchema } from '../schemas.js';

export function registerDispatchRoute(app: FastifyInstance): void {
  app.post('/api/dispatch', async (req) => {
    const body = dispatchRequestSchema.parse(req.body);
    return sendCommand('dispatch', body as Record<string, unknown>);
  });
}
