import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { messagePassesFilter } from '../src/chat/chat-filter.js';
import type { ChatMessageSnapshot } from '@foundry-toolkit/shared/rpc';

const ACTOR_A = 'actor-aaa';
const ACTOR_B = 'actor-bbb';
const USER_1 = 'user-111';
const USER_2 = 'user-222';

function makeMessage(overrides: Partial<ChatMessageSnapshot> = {}): ChatMessageSnapshot {
  return {
    id: 'msg-x',
    uuid: null,
    type: null,
    author: null,
    timestamp: null,
    flavor: '',
    content: 'test',
    speaker: null,
    speakerOwnerIds: [],
    whisper: [],
    isRoll: false,
    rolls: [],
    flags: {},
    ...overrides,
  };
}

describe('messagePassesFilter', () => {
  // Rule 1 — public messages (empty whisper list)

  it('passes a public message for any actorId regardless of userId', () => {
    const msg = makeMessage({ whisper: [] });
    assert.equal(messagePassesFilter(msg, ACTOR_A, null), true);
    assert.equal(messagePassesFilter(msg, ACTOR_B, USER_1), true);
  });

  it('passes a public roll for any actor', () => {
    const msg = makeMessage({ whisper: [], isRoll: true });
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), true);
    assert.equal(messagePassesFilter(msg, ACTOR_B, null), true);
  });

  // Rule 2 — speaker is the watched actor

  it('passes when the message speaker is actorId (even if whispered)', () => {
    const msg = makeMessage({
      speaker: { actor: ACTOR_A },
      whisper: [USER_2], // whispered to someone else
    });
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), true);
  });

  it('does not pass on Rule 2 when speaker is a different actor', () => {
    const msg = makeMessage({
      speaker: { actor: ACTOR_B },
      whisper: [USER_2],
    });
    // ACTOR_A is watching, ACTOR_B spoke — no match on Rule 2
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), false);
  });

  it('passes on Rule 2 when speaker has no userId but is watching actor', () => {
    const msg = makeMessage({
      speaker: { actor: ACTOR_A },
      whisper: [USER_2],
    });
    assert.equal(messagePassesFilter(msg, ACTOR_A, null), true);
  });

  // Rule 3 — userId is a whisper recipient

  it('passes when userId is in the whisper list', () => {
    const msg = makeMessage({ whisper: [USER_1, USER_2] });
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), true);
  });

  it('does not pass when userId is not in the whisper list', () => {
    const msg = makeMessage({ whisper: [USER_2] });
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), false);
  });

  it('does not apply Rule 3 when userId is null', () => {
    const msg = makeMessage({ whisper: [USER_1] });
    // No speaker match, empty actor in speaker, userId null → Rule 3 skipped
    assert.equal(messagePassesFilter(msg, ACTOR_A, null), false);
  });

  // Exclusion cases

  it('excludes a whisper between two other parties', () => {
    const msg = makeMessage({
      speaker: { actor: ACTOR_B },
      whisper: [USER_2],
    });
    // ACTOR_A watches as USER_1 — none of the rules match
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), false);
  });

  it('excludes a whisper from an actor without speaker info', () => {
    const msg = makeMessage({ speaker: null, whisper: [USER_2] });
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), false);
  });

  it('excludes a whisper when speaker.actor is undefined', () => {
    const msg = makeMessage({ speaker: { alias: 'GM' }, whisper: [USER_2] });
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), false);
  });

  // Rule precedence — first matching rule wins; order doesn't matter here
  // since all rules are OR-combined, but verify multi-rule messages pass once.

  it('passes when both Rule 2 and Rule 3 match (no double-count issue)', () => {
    const msg = makeMessage({
      speaker: { actor: ACTOR_A },
      whisper: [USER_1],
    });
    // Actor-A speaks and whispers to User-1 who is watching Actor-A
    assert.equal(messagePassesFilter(msg, ACTOR_A, USER_1), true);
  });
});
