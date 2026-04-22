import type { EventChannelController } from '@/events/EventChannelController';
import type { SetEventSubscriptionParams, SetEventSubscriptionResult } from '@/commands/types';

/**
 * Server asked the module to enable or disable forwarding for an event
 * channel. The controller owns hook state; this handler just dispatches
 * and echoes the decision back so the server can log the ack.
 */
export function createSetEventSubscriptionHandler(
  controller: EventChannelController,
): (params: SetEventSubscriptionParams) => Promise<SetEventSubscriptionResult> {
  return async (params) => {
    if (params.active) {
      controller.enable(params.channel);
    } else {
      controller.disable(params.channel);
    }
    return Promise.resolve({ channel: params.channel, active: params.active });
  };
}
