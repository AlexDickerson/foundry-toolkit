import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelManager } from '../src/events/channel-manager.js';

describe('ChannelManager', () => {
  it('fires onSubscriptionChange on the 0→1 transition and not on later subscribers', () => {
    const mgr = new ChannelManager();
    const changes: Array<[string, boolean]> = [];
    mgr.setSubscriptionChangeCallback((ch, active) => {
      changes.push([ch, active]);
    });

    mgr.subscribe('rolls', () => {
      /* noop */
    });
    mgr.subscribe('rolls', () => {
      /* noop */
    });
    mgr.subscribe('rolls', () => {
      /* noop */
    });

    assert.deepEqual(changes, [['rolls', true]]);
  });

  it('fires onSubscriptionChange on the 1→0 transition only when the last subscriber leaves', () => {
    const mgr = new ChannelManager();
    const changes: Array<[string, boolean]> = [];
    mgr.setSubscriptionChangeCallback((ch, active) => {
      changes.push([ch, active]);
    });

    const unsub1 = mgr.subscribe('rolls', () => {
      /* noop */
    });
    const unsub2 = mgr.subscribe('rolls', () => {
      /* noop */
    });

    unsub1();
    assert.deepEqual(changes, [['rolls', true]], 'removing 1 of 2 must not fire off-transition');

    unsub2();
    assert.deepEqual(changes, [
      ['rolls', true],
      ['rolls', false],
    ]);
  });

  it('tracks channels independently', () => {
    const mgr = new ChannelManager();
    const changes: Array<[string, boolean]> = [];
    mgr.setSubscriptionChangeCallback((ch, active) => {
      changes.push([ch, active]);
    });

    const unsubRolls = mgr.subscribe('rolls', () => {
      /* noop */
    });
    const unsubChat = mgr.subscribe('chat', () => {
      /* noop */
    });

    assert.deepEqual(changes, [
      ['rolls', true],
      ['chat', true],
    ]);

    unsubRolls();
    assert.deepEqual(changes, [
      ['rolls', true],
      ['chat', true],
      ['rolls', false],
    ]);
    unsubChat();
  });

  it('fans out published events to all subscribers with a single SSE-framed chunk', () => {
    const mgr = new ChannelManager();
    const chunks1: string[] = [];
    const chunks2: string[] = [];
    mgr.subscribe('rolls', (c) => chunks1.push(c));
    mgr.subscribe('rolls', (c) => chunks2.push(c));

    mgr.publish('rolls', { total: 20 });

    assert.equal(chunks1.length, 1);
    assert.equal(chunks2.length, 1);
    assert.equal(chunks1[0], 'data: {"total":20}\n\n');
    assert.equal(chunks2[0], chunks1[0]);
  });

  it('silently drops published events on channels with no subscribers', () => {
    const mgr = new ChannelManager();
    let fired = false;
    mgr.setSubscriptionChangeCallback(() => {
      fired = true;
    });
    mgr.publish('rolls', { total: 20 });
    assert.equal(fired, false);
  });

  it('prunes a dead subscriber and fires off-transition when the drain empties the channel', () => {
    const mgr = new ChannelManager();
    const changes: Array<[string, boolean]> = [];
    mgr.setSubscriptionChangeCallback((ch, active) => {
      changes.push([ch, active]);
    });

    mgr.subscribe('rolls', () => {
      throw new Error('simulated dead subscriber');
    });

    assert.deepEqual(changes, [['rolls', true]]);

    mgr.publish('rolls', { total: 20 });

    assert.deepEqual(
      changes,
      [
        ['rolls', true],
        ['rolls', false],
      ],
      'dead-subscriber sweep must fire the off-transition',
    );
    assert.deepEqual(mgr.getActiveChannels(), []);
  });

  it('unsubscribe is idempotent', () => {
    const mgr = new ChannelManager();
    const changes: Array<[string, boolean]> = [];
    mgr.setSubscriptionChangeCallback((ch, active) => {
      changes.push([ch, active]);
    });

    const unsub = mgr.subscribe('rolls', () => {
      /* noop */
    });

    unsub();
    unsub();
    unsub();

    assert.deepEqual(changes, [
      ['rolls', true],
      ['rolls', false],
    ]);
  });

  it('getActiveChannels reflects current subscriber presence', () => {
    const mgr = new ChannelManager();
    assert.deepEqual(mgr.getActiveChannels(), []);

    const unsubRolls = mgr.subscribe('rolls', () => {
      /* noop */
    });
    mgr.subscribe('chat', () => {
      /* noop */
    });

    assert.deepEqual(mgr.getActiveChannels().sort(), ['chat', 'rolls']);

    unsubRolls();
    assert.deepEqual(mgr.getActiveChannels(), ['chat']);
  });

  it('callback throwing does not break subsequent subscriptions', () => {
    const mgr = new ChannelManager();
    mgr.setSubscriptionChangeCallback(() => {
      throw new Error('callback boom');
    });

    assert.doesNotThrow(() => {
      const unsub = mgr.subscribe('rolls', () => {
        /* noop */
      });
      unsub();
    });
  });
});
