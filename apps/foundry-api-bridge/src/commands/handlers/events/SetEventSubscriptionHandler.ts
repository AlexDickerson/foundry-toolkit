import type { EventChannelController, SubscriberId } from '@/events/EventChannelController';
import type { SetEventSubscriptionParams, SetEventSubscriptionResult } from '@/commands/types';

/**
 * Server asked the module to enable or disable forwarding for an event
 * channel. The controller owns hook state; this handler just dispatches
 * and echoes the decision back so the server can log the ack.
 *
 * Each connected client gets its own handler closing over its own
 * SubscriberId so the controller can refcount channel subscriptions
 * per-connection — running two MCP servers against one Foundry world
 * doesn't drop a channel when one of them unsubscribes.
 */
export function createSetEventSubscriptionHandler(
  controller: EventChannelController,
  subscriber: SubscriberId,
): (params: SetEventSubscriptionParams) => Promise<SetEventSubscriptionResult> {
  return async (params) => {
    if (params.active) {
      controller.enable(params.channel, subscriber);
    } else {
      controller.disable(params.channel, subscriber);
    }
    return Promise.resolve({ channel: params.channel, active: params.active });
  };
}
