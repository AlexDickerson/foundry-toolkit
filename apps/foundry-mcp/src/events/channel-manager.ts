import { log } from '../logger.js';

type SubscriberFn = (chunk: string) => void;

type SubscriptionChangeCallback = (channel: string, active: boolean) => void;

/**
 * Multi-channel SSE fan-out with activation tracking. A channel is "active"
 * while it has at least one subscriber; the manager fires
 * `onSubscriptionChange(channel, true)` on the 0→1 transition and
 * `onSubscriptionChange(channel, false)` on the 1→0 transition. Callers
 * wire those transitions to the Foundry module so `Hooks.on` listeners
 * are registered only when some client is listening and torn down when
 * the last one leaves.
 *
 * Publish pre-encodes a single SSE chunk per call so fan-out avoids
 * re-serialising once per subscriber. Dead subscribers (write throws)
 * are dropped in place and can themselves trigger a 1→0 transition.
 */
export class ChannelManager {
  private readonly subscribers = new Map<string, Set<SubscriberFn>>();
  private onSubscriptionChange: SubscriptionChangeCallback | null = null;

  setSubscriptionChangeCallback(cb: SubscriptionChangeCallback | null): void {
    this.onSubscriptionChange = cb;
  }

  subscribe(channel: string, onEvent: SubscriberFn): () => void {
    let set = this.subscribers.get(channel);
    if (!set) {
      set = new Set();
      this.subscribers.set(channel, set);
    }
    set.add(onEvent);
    if (set.size === 1) {
      this.fireChange(channel, true);
    }
    return () => {
      this.unsubscribe(channel, onEvent);
    };
  }

  private unsubscribe(channel: string, onEvent: SubscriberFn): void {
    const set = this.subscribers.get(channel);
    if (!set) return;
    const removed = set.delete(onEvent);
    if (!removed) return;
    if (set.size === 0) {
      this.subscribers.delete(channel);
      this.fireChange(channel, false);
    }
  }

  publish(channel: string, data: unknown): void {
    const set = this.subscribers.get(channel);
    if (!set || set.size === 0) return;
    const chunk = `data: ${JSON.stringify(data)}\n\n`;
    const dead: SubscriberFn[] = [];
    for (const send of set) {
      try {
        send(chunk);
      } catch (err) {
        log.warn(`SSE write failed on "${channel}": ${err instanceof Error ? err.message : String(err)}`);
        dead.push(send);
      }
    }
    if (dead.length === 0) return;
    for (const fn of dead) set.delete(fn);
    // If the dead sweep just drained the channel, flip the transition
    // so the module tears down its hook registrations. Same semantics
    // as an explicit unsubscribe.
    if (set.size === 0) {
      this.subscribers.delete(channel);
      this.fireChange(channel, false);
    }
  }

  getActiveChannels(): string[] {
    return Array.from(this.subscribers.keys());
  }

  private fireChange(channel: string, active: boolean): void {
    const cb = this.onSubscriptionChange;
    if (!cb) return;
    try {
      cb(channel, active);
    } catch (err) {
      log.error(
        `Subscription-change callback threw for "${channel}" (active=${String(active)}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export const channelManager = new ChannelManager();
