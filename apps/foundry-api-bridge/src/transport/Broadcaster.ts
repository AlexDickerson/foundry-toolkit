import type { WebSocketClient } from '@/transport/WebSocketClient';

// Fire-and-forget push surface for channel events. Matches the subset
// of `WebSocketClient` used by `EventChannelController` so a single
// controller can drive either one connection or many.
export interface EventPublisher {
  pushEvent(channel: string, data: unknown): void;
}

// Fans channel events across every connected client. Disconnected
// clients are skipped silently — pushEvent on a dead socket is a
// no-op today, so iterating doesn't surface errors either way.
export class Broadcaster implements EventPublisher {
  constructor(private readonly clients: readonly WebSocketClient[]) {}

  pushEvent(channel: string, data: unknown): void {
    for (const client of this.clients) {
      if (client.isConnected()) {
        client.pushEvent(channel, data);
      }
    }
  }
}
