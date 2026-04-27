import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import { chatMessageSnapshotSchema } from '@foundry-toolkit/shared/rpc';
import { channelManager } from '../../events/channel-manager.js';
import type { ChatRingBuffer } from '../../chat/chat-ring-buffer.js';
import { messagePassesFilter } from '../../chat/chat-filter.js';

const actorIdParam = z.object({ actorId: z.string().min(1) });

const liveChatQuery = z.object({
  userId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function parseSseData(chunk: string): { eventType: string; data: unknown } | null {
  const line = chunk.split('\n')[0] ?? '';
  if (!line.startsWith('data: ')) return null;
  try {
    const parsed = JSON.parse(line.slice(6)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { eventType, data } = parsed as Record<string, unknown>;
    if (typeof eventType !== 'string') return null;
    return { eventType, data };
  } catch {
    return null;
  }
}

export function registerLiveChatRoutes(app: FastifyInstance, buffer: ChatRingBuffer): void {
  // Returns the last `limit` messages from the ring buffer filtered for
  // actorId + userId. Suitable for initial load when the Chat tab opens.
  app.get('/api/live/chat/:actorId/recent', async (req, reply) => {
    const { actorId } = actorIdParam.parse(req.params);
    const parsed = liveChatQuery.parse(req.query);
    const userId = parsed.userId ?? null;
    const limit = parsed.limit;

    const { messages, truncated } = buffer.recent(limit);
    const filtered = messages.filter((m) => messagePassesFilter(m, actorId, userId));

    return reply.send({ messages: filtered, truncated });
  });

  // Filtered SSE stream: delivers chat events in real-time, scoped to
  // what `actorId` (and optionally `userId`) should see. Subscribes to
  // the raw 'chat' channel and applies messagePassesFilter before forwarding.
  app.get('/api/live/chat/:actorId/stream', (req, reply) => {
    const { actorId } = actorIdParam.parse(req.params);
    const parsed = liveChatQuery.parse(req.query);
    const userId = parsed.userId ?? null;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`: connected\n\n`);

    const unsubscribe = channelManager.subscribe('chat', (chunk) => {
      const envelope = parseSseData(chunk);
      if (!envelope) return;
      const { eventType, data } = envelope;

      if (eventType === 'delete') {
        // Always forward deletes — the client no-ops on IDs it never received.
        reply.raw.write(chunk);
        return;
      }

      const result = chatMessageSnapshotSchema.safeParse(data);
      if (!result.success) return;

      if (messagePassesFilter(result.data, actorId, userId)) {
        reply.raw.write(chunk);
      }
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
