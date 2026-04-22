import type { FastifyInstance } from 'fastify';
import { channelManager } from '../../events/channel-manager.js';
import { eventChannelParam } from '../schemas.js';

export function registerEventRoutes(app: FastifyInstance): void {
  app.get('/api/events/:channel/stream', (req, reply) => {
    const { channel } = eventChannelParam.parse(req.params);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`: connected\n\n`);

    const unsubscribe = channelManager.subscribe(channel, (chunk) => {
      reply.raw.write(chunk);
    });

    // Heartbeat keeps idle connections open through proxies that drop
    // silent streams. Matches /api/prompts/stream.
    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 20_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
