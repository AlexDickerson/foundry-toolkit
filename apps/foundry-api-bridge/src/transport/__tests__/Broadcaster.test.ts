import { Broadcaster } from '@/transport/Broadcaster';
import type { WebSocketClient } from '@/transport/WebSocketClient';

// Minimal stand-in that implements only what the broadcaster reads
// (pushEvent, isConnected) — avoids spinning up the full
// WebSocketClient machinery just to verify fan-out.
function makeStub(connected: boolean): {
  stub: WebSocketClient;
  pushEvent: jest.Mock;
} {
  const pushEvent = jest.fn();
  const stub = {
    isConnected: () => connected,
    pushEvent,
  } as unknown as WebSocketClient;
  return { stub, pushEvent };
}

describe('Broadcaster', () => {
  it('fans pushEvent to every connected client', () => {
    const a = makeStub(true);
    const b = makeStub(true);
    const broadcaster = new Broadcaster([a.stub, b.stub]);

    broadcaster.pushEvent('rolls', { x: 1 });

    expect(a.pushEvent).toHaveBeenCalledWith('rolls', { x: 1 });
    expect(b.pushEvent).toHaveBeenCalledWith('rolls', { x: 1 });
  });

  it('skips disconnected clients', () => {
    const live = makeStub(true);
    const dead = makeStub(false);
    const broadcaster = new Broadcaster([live.stub, dead.stub]);

    broadcaster.pushEvent('chat', { id: 'abc' });

    expect(live.pushEvent).toHaveBeenCalledTimes(1);
    expect(dead.pushEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is connected', () => {
    const a = makeStub(false);
    const broadcaster = new Broadcaster([a.stub]);

    expect(() => {
      broadcaster.pushEvent('combat', {});
    }).not.toThrow();
    expect(a.pushEvent).not.toHaveBeenCalled();
  });

  it('is a no-op with zero clients', () => {
    const broadcaster = new Broadcaster([]);
    expect(() => {
      broadcaster.pushEvent('combat', {});
    }).not.toThrow();
  });
});
