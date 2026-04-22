import type { FastifyInstance } from 'fastify';
import { getPendingBridgeEvents, resolveBridgeEvent, subscribeToBridgeEvents } from '../../bridge.js';
import { log } from '../../logger.js';
import { bridgeIdParam, resolvePromptBody } from '../schemas.js';

// Frontend subscribes here to learn about pending module-initiated
// prompts (ChoiceSet dialogs the module wants us to render). The
// stream is Server-Sent Events; each line is a JSON payload of
// `{ kind: 'added' | 'removed', event: { bridgeId, type, payload } }`.
// On connect we flush the current queue as `added` events so a late
// subscriber still sees in-flight prompts.
export function registerPromptRoutes(app: FastifyInstance): void {
  app.get('/api/prompts/stream', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`: connected\n\n`);

    for (const event of getPendingBridgeEvents()) {
      reply.raw.write(`data: ${JSON.stringify({ kind: 'added', event })}\n\n`);
    }

    const unsubscribe = subscribeToBridgeEvents((chunk) => {
      reply.raw.write(chunk);
    });

    // Heartbeat keeps the connection alive through proxies that
    // aggressively drop idle streams. 20s is well under typical
    // idle-timeouts.
    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 20_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post('/api/prompts/:id/resolve', async (req, reply) => {
    const { id } = bridgeIdParam.parse(req.params);
    const { value } = resolvePromptBody.parse(req.body);
    const resolved = resolveBridgeEvent(id, { value });
    if (!resolved) {
      log.warn(`Resolve for unknown / already-resolved prompt ${id.slice(0, 8)}`);
      await reply.code(404).send({ error: 'Prompt not found or already resolved' });
      return;
    }
    return { ok: true };
  });
}
