import { EventChannelController } from '@/events/EventChannelController';
import type { EventPublisher } from '@/transport/Broadcaster';

// Tiny Foundry Hooks shim that lets us assert which hook names the
// controller registered and tore down, and drive callbacks manually.
interface HookRecord {
  name: string;
  id: number;
  fn: (...args: unknown[]) => void;
}

class HooksMock {
  private nextId = 1;
  registered: HookRecord[] = [];

  on(name: string, fn: (...args: unknown[]) => void): number {
    const id = this.nextId++;
    this.registered.push({ name, id, fn });
    return id;
  }

  off(name: string, id: number): void {
    this.registered = this.registered.filter((h) => !(h.name === name && h.id === id));
  }

  activeNames(): string[] {
    return this.registered.map((h) => h.name).sort();
  }

  activeCount(name: string): number {
    return this.registered.filter((h) => h.name === name).length;
  }

  fire(name: string, ...args: unknown[]): void {
    for (const h of this.registered.filter((h) => h.name === name)) {
      h.fn(...args);
    }
  }
}

let hooksMock: HooksMock;

beforeEach(() => {
  hooksMock = new HooksMock();
  (global as unknown as Record<string, unknown>)['Hooks'] = hooksMock;
});

function makePublisher(): { publisher: EventPublisher; pushEvent: jest.Mock } {
  const pushEvent = jest.fn();
  return { publisher: { pushEvent }, pushEvent };
}

describe('EventChannelController', () => {
  describe('subscriber refcounting', () => {
    it('registers hooks on the first subscriber and tears down on the last', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      const subA = {};
      const subB = {};

      controller.enable('combat', subA);
      expect(hooksMock.activeCount('combatStart')).toBe(1);

      // Second subscriber must not re-register the hooks.
      controller.enable('combat', subB);
      expect(hooksMock.activeCount('combatStart')).toBe(1);

      // Losing one subscriber keeps hooks alive for the other.
      controller.disable('combat', subA);
      expect(hooksMock.activeCount('combatStart')).toBe(1);

      // Last subscriber leaves — tear down.
      controller.disable('combat', subB);
      expect(hooksMock.activeCount('combatStart')).toBe(0);
    });

    it('ignores enable with an unknown channel', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('bogus', {});
      expect(hooksMock.registered).toHaveLength(0);
    });

    it('no-ops when disabling a channel the subscriber never enabled', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      expect(() => {
        controller.disable('combat', {});
      }).not.toThrow();
      expect(hooksMock.registered).toHaveLength(0);
    });

    it('repeated enable from the same subscriber is idempotent', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      const sub = {};
      controller.enable('combat', sub);
      controller.enable('combat', sub);
      expect(hooksMock.activeCount('combatStart')).toBe(1);

      controller.disable('combat', sub);
      expect(hooksMock.activeCount('combatStart')).toBe(0);
    });
  });

  describe('shared createChatMessage hook', () => {
    it('registers once for rolls and chat combined', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      const sub = {};

      controller.enable('rolls', sub);
      expect(hooksMock.activeCount('createChatMessage')).toBe(1);

      controller.enable('chat', sub);
      expect(hooksMock.activeCount('createChatMessage')).toBe(1);
    });

    it('keeps the shared hook alive while either rolls or chat has any subscriber', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      const a = {};
      const b = {};

      controller.enable('rolls', a);
      controller.enable('chat', b);

      controller.disable('rolls', a);
      expect(hooksMock.activeCount('createChatMessage')).toBe(1);

      controller.disable('chat', b);
      expect(hooksMock.activeCount('createChatMessage')).toBe(0);
    });

    it('tears down shared hook only after every subscriber across rolls+chat has left', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      const a = {};
      const b = {};

      // Two subscribers on rolls, one on chat.
      controller.enable('rolls', a);
      controller.enable('rolls', b);
      controller.enable('chat', a);

      controller.disable('rolls', a);
      expect(hooksMock.activeCount('createChatMessage')).toBe(1);
      controller.disable('chat', a);
      expect(hooksMock.activeCount('createChatMessage')).toBe(1);
      controller.disable('rolls', b);
      expect(hooksMock.activeCount('createChatMessage')).toBe(0);
    });
  });

  describe('removeSubscriber', () => {
    it('drops every subscription for a client and tears down channels they alone held', () => {
      const { publisher } = makePublisher();
      const controller = new EventChannelController(publisher);
      const a = {};
      const b = {};

      controller.enable('combat', a);
      controller.enable('chat', a);
      controller.enable('combat', b);

      controller.removeSubscriber(a);

      // `a` only held chat solo → torn down.
      expect(hooksMock.activeCount('deleteChatMessage')).toBe(0);
      // combat still has `b` → alive.
      expect(hooksMock.activeCount('combatStart')).toBe(1);
    });
  });

  describe('event publishing', () => {
    it('publishes a rolls payload when a chat message with a roll fires', () => {
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('rolls', {});

      hooksMock.fire('createChatMessage', {
        id: 'msg1',
        isRoll: true,
        rolls: [{ total: 17, formula: '1d20+5', dice: [{ faces: 20, results: [{ result: 12, active: true }] }] }],
        author: { id: 'u1', name: 'GM' },
      });

      expect(pushEvent).toHaveBeenCalledWith(
        'rolls',
        expect.objectContaining({ id: 'msg1', formula: '1d20+5', rollTotal: 17 }),
      );
    });

    it('does not publish to rolls for non-roll chat messages', () => {
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('rolls', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false });

      expect(pushEvent).not.toHaveBeenCalled();
    });

    it('publishes create/update/delete for the chat channel', () => {
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false, content: 'hi' });
      hooksMock.fire('updateChatMessage', { id: 'msg1', isRoll: false, content: 'hi edit' });
      hooksMock.fire('deleteChatMessage', { id: 'msg1', isRoll: false });

      expect(pushEvent.mock.calls).toEqual([
        ['chat', { eventType: 'create', data: expect.objectContaining({ id: 'msg1' }) }],
        ['chat', { eventType: 'update', data: expect.objectContaining({ content: 'hi edit' }) }],
        ['chat', { eventType: 'delete', data: { id: 'msg1' } }],
      ]);
    });
  });

  describe('speakerOwnerIds enrichment', () => {
    function makeGameMock(actorId: string, ownership: Record<string, number>) {
      (global as unknown as Record<string, unknown>)['game'] = {
        actors: {
          get(id: string) {
            return id === actorId ? { ownership } : null;
          },
        },
      };
    }

    afterEach(() => {
      delete (global as unknown as Record<string, unknown>)['game'];
    });

    it('returns an empty array when the message has no speaker actor', () => {
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false, content: 'hi' });

      const payload = pushEvent.mock.calls[0]?.[1] as { eventType: string; data: Record<string, unknown> };
      expect(payload.data['speakerOwnerIds']).toEqual([]);
    });

    it('returns an empty array when the actor is not found in game.actors', () => {
      (global as unknown as Record<string, unknown>)['game'] = { actors: { get: () => null } };
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false, speaker: { actor: 'missing-id' } });

      const payload = pushEvent.mock.calls[0]?.[1] as { eventType: string; data: Record<string, unknown> };
      expect(payload.data['speakerOwnerIds']).toEqual([]);
    });

    it('returns only user IDs with ownership level 3 (OWNER)', () => {
      makeGameMock('actor-001', { userA: 3, userB: 1, userC: 2 });
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false, speaker: { actor: 'actor-001' } });

      const payload = pushEvent.mock.calls[0]?.[1] as { eventType: string; data: Record<string, unknown> };
      expect(payload.data['speakerOwnerIds']).toEqual(['userA']);
    });

    it('returns all owner user IDs when there are multiple owners', () => {
      makeGameMock('actor-001', { userA: 3, userB: 3, userC: 1 });
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false, speaker: { actor: 'actor-001' } });

      const payload = pushEvent.mock.calls[0]?.[1] as { eventType: string; data: Record<string, unknown> };
      expect((payload.data['speakerOwnerIds'] as string[]).sort()).toEqual(['userA', 'userB']);
    });

    it('excludes the special "default" key even if its level is 3', () => {
      makeGameMock('actor-001', { default: 3, userA: 3 });
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', { id: 'msg1', isRoll: false, speaker: { actor: 'actor-001' } });

      const payload = pushEvent.mock.calls[0]?.[1] as { eventType: string; data: Record<string, unknown> };
      expect(payload.data['speakerOwnerIds']).toEqual(['userA']);
    });

    it('existing serialized fields are unchanged (regression)', () => {
      makeGameMock('actor-001', { userA: 3 });
      const { publisher, pushEvent } = makePublisher();
      const controller = new EventChannelController(publisher);
      controller.enable('chat', {});

      hooksMock.fire('createChatMessage', {
        id: 'msg-reg',
        isRoll: false,
        content: '<p>Hello</p>',
        flavor: 'IC',
        speaker: { actor: 'actor-001', alias: 'Valeros' },
        whisper: [],
        author: { id: 'u1', name: 'Player' },
        flags: { pf2e: {} },
      });

      const payload = pushEvent.mock.calls[0]?.[1] as { eventType: string; data: Record<string, unknown> };
      const data = payload.data;
      expect(data['id']).toBe('msg-reg');
      expect(data['content']).toBe('<p>Hello</p>');
      expect(data['flavor']).toBe('IC');
      expect(data['whisper']).toEqual([]);
      expect(data['isRoll']).toBe(false);
      expect(data['author']).toEqual({ id: 'u1', name: 'Player' });
      expect(data['speakerOwnerIds']).toEqual(['userA']);
    });
  });
});
