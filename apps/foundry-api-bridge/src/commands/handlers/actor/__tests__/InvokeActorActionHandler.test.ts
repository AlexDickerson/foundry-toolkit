import {
  invokeActorActionHandler,
  KNOWN_ACTIONS,
} from '../InvokeActorActionHandler';

interface MockActor {
  id: string;
  uuid: string;
  type: string;
}

// Minimal shims for the Foundry globals the handler touches. The real
// module reads `globalThis.game.actors.get(id)` and
// `globalThis.game.pf2e.actions.<name>`; we only need those two to
// exercise the dispatch and per-action param translation.
function setupFoundry(opts: {
  actor: MockActor | null;
  actions?: Record<string, jest.Mock>;
}): { actors: Map<string, MockActor>; craftMock: jest.Mock | null } {
  const actors = new Map<string, MockActor>();
  if (opts.actor) actors.set(opts.actor.id, opts.actor);

  const actionMocks = opts.actions ?? {};
  const craftMock = actionMocks['craft'] ?? null;

  (globalThis as unknown as Record<string, unknown>)['game'] = {
    actors: {
      get: (id: string): MockActor | undefined => actors.get(id),
    },
    pf2e: {
      actions: actionMocks,
    },
  };

  return { actors, craftMock };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['game'];
});

describe('invokeActorActionHandler', () => {
  const actor: MockActor = { id: 'actor1', uuid: 'Actor.actor1', type: 'character' };

  it('exposes a `craft` entry in KNOWN_ACTIONS', () => {
    expect(KNOWN_ACTIONS).toContain('craft');
  });

  it('throws when the actor is missing', async () => {
    setupFoundry({ actor: null });
    await expect(
      invokeActorActionHandler({ actorId: 'missing', action: 'craft', params: {} }),
    ).rejects.toThrow(/Actor not found: missing/);
  });

  it('throws on an unknown action with a helpful list', async () => {
    setupFoundry({ actor });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'nope', params: {} }),
    ).rejects.toThrow(/Unknown action: nope.*craft/);
  });

  it('craft: requires itemUuid', async () => {
    setupFoundry({ actor, actions: { craft: jest.fn() } });
    await expect(invokeActorActionHandler({ actorId: 'actor1', action: 'craft', params: {} })).rejects.toThrow(
      /craft: params\.itemUuid is required/,
    );
  });

  it('craft: rejects non-string itemUuid', async () => {
    setupFoundry({ actor, actions: { craft: jest.fn() } });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'craft',
        params: { itemUuid: 42 },
      }),
    ).rejects.toThrow(/itemUuid is required/);
  });

  it('craft: errors when pf2e system is not installed', async () => {
    (globalThis as unknown as Record<string, unknown>)['game'] = {
      actors: { get: () => actor },
      // No pf2e.actions at all.
    };
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'craft',
        params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc' },
      }),
    ).rejects.toThrow(/pf2e system not installed/);
  });

  it('craft: invokes game.pf2e.actions.craft with uuid + actors + quantity', async () => {
    const craftMock = jest.fn().mockResolvedValue(undefined);
    setupFoundry({ actor, actions: { craft: craftMock } });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity: 3 },
    });

    expect(craftMock).toHaveBeenCalledTimes(1);
    expect(craftMock).toHaveBeenCalledWith({
      uuid: 'Compendium.pf2e.equipment-srd.Item.abc',
      actors: [actor],
      quantity: 3,
    });
    expect(result).toEqual({ ok: true });
  });

  it('craft: defaults quantity to 1 when omitted or invalid', async () => {
    const craftMock = jest.fn().mockResolvedValue(undefined);
    setupFoundry({ actor, actions: { craft: craftMock } });

    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc' },
    });
    expect(craftMock.mock.calls[0]?.[0]).toMatchObject({ quantity: 1 });

    craftMock.mockClear();
    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity: -5 },
    });
    expect(craftMock.mock.calls[0]?.[0]).toMatchObject({ quantity: 1 });

    craftMock.mockClear();
    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity: 'two' },
    });
    expect(craftMock.mock.calls[0]?.[0]).toMatchObject({ quantity: 1 });
  });

  it('craft: floors non-integer positive quantities', async () => {
    const craftMock = jest.fn().mockResolvedValue(undefined);
    setupFoundry({ actor, actions: { craft: craftMock } });

    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity: 2.7 },
    });
    expect(craftMock.mock.calls[0]?.[0]).toMatchObject({ quantity: 2 });
  });

  it('defaults params to an empty object when omitted', async () => {
    setupFoundry({ actor, actions: { craft: jest.fn() } });
    // Missing `params` altogether; craft handler should still reach
    // its itemUuid check and reject cleanly.
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'craft' } as Parameters<typeof invokeActorActionHandler>[0]),
    ).rejects.toThrow(/itemUuid is required/);
  });
});
