import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelManager } from '../src/events/channel-manager.js';
import { ChatRingBuffer } from '../src/chat/chat-ring-buffer.js';
import type { ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';

// Minimal valid ChatMessageSnapshot to use throughout tests.
function makeMessage(id: string, overrides: Partial<ChatMessageSnapshot> = {}): ChatMessageSnapshot {
  return {
    id,
    uuid: null,
    type: null,
    author: null,
    timestamp: null,
    flavor: '',
    content: 'Hello',
    speaker: null,
    speakerOwnerIds: [],
    whisper: [],
    isRoll: false,
    rolls: [],
    flags: {},
    ...overrides,
  };
}

// Publish a chat event through a ChannelManager and check the ring buffer.
function publishCreate(mgr: ChannelManager, message: ChatMessageSnapshot): void {
  mgr.publish('chat', { eventType: 'create', data: message });
}

function publishUpdate(mgr: ChannelManager, message: ChatMessageSnapshot): void {
  mgr.publish('chat', { eventType: 'update', data: message });
}

function publishDelete(mgr: ChannelManager, id: string): void {
  mgr.publish('chat', { eventType: 'delete', data: { id } });
}

describe('ChatRingBuffer', () => {
  it('starts empty', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    const { messages, truncated } = buffer.recent(10);
    assert.equal(messages.length, 0);
    assert.equal(truncated, false);
  });

  it('stores a created message', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    publishCreate(mgr, makeMessage('msg-1'));
    const { messages } = buffer.recent(10);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.id, 'msg-1');
  });

  it('accumulates messages in chronological order', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    publishCreate(mgr, makeMessage('a'));
    publishCreate(mgr, makeMessage('b'));
    publishCreate(mgr, makeMessage('c'));
    const { messages } = buffer.recent(10);
    assert.deepEqual(
      messages.map((m) => m.id),
      ['a', 'b', 'c'],
    );
  });

  it('evicts oldest messages when maxSize is exceeded', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(3, mgr);
    publishCreate(mgr, makeMessage('old-1'));
    publishCreate(mgr, makeMessage('old-2'));
    publishCreate(mgr, makeMessage('keep-1'));
    publishCreate(mgr, makeMessage('keep-2')); // evicts old-1
    const { messages } = buffer.recent(10);
    assert.equal(messages.length, 3);
    assert.deepEqual(
      messages.map((m) => m.id),
      ['old-2', 'keep-1', 'keep-2'],
    );
  });

  it('replaces an existing message on update', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    publishCreate(mgr, makeMessage('msg-1', { content: 'original' }));
    publishUpdate(mgr, makeMessage('msg-1', { content: 'edited' }));
    const { messages } = buffer.recent(10);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.content, 'edited');
  });

  it('ignores update for a message not in the buffer', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    publishCreate(mgr, makeMessage('a'));
    publishUpdate(mgr, makeMessage('z', { content: 'ghost' }));
    const { messages } = buffer.recent(10);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.id, 'a');
  });

  it('removes a message on delete', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    publishCreate(mgr, makeMessage('msg-1'));
    publishCreate(mgr, makeMessage('msg-2'));
    publishDelete(mgr, 'msg-1');
    const { messages } = buffer.recent(10);
    assert.deepEqual(
      messages.map((m) => m.id),
      ['msg-2'],
    );
  });

  it('ignores delete for unknown id', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    publishCreate(mgr, makeMessage('msg-1'));
    publishDelete(mgr, 'ghost');
    assert.equal(buffer.recent(10).messages.length, 1);
  });

  it('recent() returns at most `limit` messages (the newest)', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(100, mgr);
    for (let i = 0; i < 10; i++) publishCreate(mgr, makeMessage(`msg-${i}`));
    const { messages } = buffer.recent(3);
    assert.equal(messages.length, 3);
    assert.deepEqual(
      messages.map((m) => m.id),
      ['msg-7', 'msg-8', 'msg-9'],
    );
  });

  it('truncated is false when buffer has <= limit messages', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(100, mgr);
    publishCreate(mgr, makeMessage('a'));
    publishCreate(mgr, makeMessage('b'));
    assert.equal(buffer.recent(5).truncated, false);
  });

  it('truncated is true when buffer exceeds the requested limit', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(100, mgr);
    for (let i = 0; i < 5; i++) publishCreate(mgr, makeMessage(`msg-${i}`));
    assert.equal(buffer.recent(3).truncated, true);
  });

  it('ignores an unknown eventType silently', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    mgr.publish('chat', { eventType: 'magic', data: makeMessage('x') });
    assert.equal(buffer.recent(10).messages.length, 0);
  });

  it('ignores a create event with an invalid payload', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    mgr.publish('chat', { eventType: 'create', data: { id: 123, isRoll: 'yes' } });
    assert.equal(buffer.recent(10).messages.length, 0);
  });

  it('events on other channels do not affect the buffer', () => {
    const mgr = new ChannelManager();
    const buffer = new ChatRingBuffer(10, mgr);
    mgr.publish('rolls', { eventType: 'create', data: makeMessage('r') });
    assert.equal(buffer.recent(10).messages.length, 0);
  });
});
