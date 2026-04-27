import { chatMessageSnapshotSchema, type ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';
import type { ChannelManager } from '../events/channel-manager.js';
import { channelManager } from '../events/channel-manager.js';
import { log } from '../logger.js';

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

/**
 * In-memory ring buffer of recent chat messages, populated by subscribing
 * to the 'chat' channel on the ChannelManager. Keeps the last `maxSize`
 * messages. Create/update/delete events are processed in order so the
 * buffer stays consistent with Foundry's chat log.
 *
 * Pass a ChannelManager in the constructor for testability; production
 * code uses the module-level singleton export `chatRingBuffer`.
 */
export class ChatRingBuffer {
  private messages: ChatMessageSnapshot[] = [];

  constructor(
    private readonly maxSize: number = 200,
    mgr: ChannelManager = channelManager,
  ) {
    mgr.subscribe('chat', (chunk) => this.handleChunk(chunk));
  }

  private handleChunk(chunk: string): void {
    const envelope = parseSseData(chunk);
    if (!envelope) return;
    const { eventType, data } = envelope;

    switch (eventType) {
      case 'create': {
        const result = chatMessageSnapshotSchema.safeParse(data);
        if (!result.success) {
          log.warn(`ChatRingBuffer: invalid create payload — ${result.error.message}`);
          return;
        }
        this.insert(result.data);
        break;
      }
      case 'update': {
        const result = chatMessageSnapshotSchema.safeParse(data);
        if (result.success) this.replace(result.data);
        break;
      }
      case 'delete': {
        const id = (data as Record<string, unknown> | null | undefined)?.['id'];
        if (typeof id === 'string') this.erase(id);
        break;
      }
    }
  }

  private insert(message: ChatMessageSnapshot): void {
    this.messages.push(message);
    if (this.messages.length > this.maxSize) {
      this.messages.shift();
    }
  }

  private replace(message: ChatMessageSnapshot): void {
    const idx = this.messages.findIndex((m) => m.id === message.id);
    if (idx !== -1) this.messages[idx] = message;
  }

  private erase(id: string): void {
    this.messages = this.messages.filter((m) => m.id !== id);
  }

  /**
   * Returns up to `limit` of the most recent messages (chronological order)
   * and whether the buffer held more than `limit` messages before slicing.
   */
  recent(limit: number = 50): { messages: ChatMessageSnapshot[]; truncated: boolean } {
    const total = this.messages.length;
    return {
      messages: this.messages.slice(-limit),
      truncated: total > limit,
    };
  }
}

export const chatRingBuffer = new ChatRingBuffer();
