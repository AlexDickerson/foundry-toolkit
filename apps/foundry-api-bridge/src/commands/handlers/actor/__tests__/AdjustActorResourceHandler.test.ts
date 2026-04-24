import { adjustActorResourceHandler } from '../AdjustActorResourceHandler';

type Actor = {
  id: string;
  system: {
    attributes: { hp: { value: number; max: number; temp: number } };
    resources: {
      heroPoints: { value: number; max: number };
      focus: { value: number; max: number };
    };
  };
  update: jest.Mock;
};

function makeActor(overrides: Partial<Actor['system']> = {}): Actor {
  return {
    id: 'actor-1',
    system: {
      attributes: { hp: { value: 10, max: 22, temp: 0 } },
      resources: {
        heroPoints: { value: 1, max: 3 },
        focus: { value: 0, max: 2 },
      },
      ...overrides,
    },
    update: jest.fn().mockResolvedValue(undefined),
  };
}

const mockGame = { actors: { get: jest.fn() } };
(global as Record<string, unknown>)['game'] = mockGame;

describe('adjustActorResourceHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('heals HP by positive delta and clamps at max', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'hp',
      delta: 20,
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.value': 22 });
    expect(result).toEqual({
      actorId: 'actor-1',
      resource: 'hp',
      before: 10,
      after: 22,
      max: 22,
    });
  });

  it('damages HP by negative delta and clamps at 0', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'hp',
      delta: -25,
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.value': 0 });
    expect(result.after).toBe(0);
  });

  it('skips update when delta would not change the value', async () => {
    const actor = makeActor();
    actor.system.attributes.hp.value = 22;
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'hp',
      delta: 10, // would heal past max; clamps to 22 = same as current
    });

    expect(actor.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      actorId: 'actor-1',
      resource: 'hp',
      before: 22,
      after: 22,
      max: 22,
    });
  });

  it('adjusts hero points within 0..max', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'hero-points',
      delta: 5,
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.resources.heroPoints.value': 3 });
    expect(result).toEqual({
      actorId: 'actor-1',
      resource: 'hero-points',
      before: 1,
      after: 3,
      max: 3,
    });
  });

  it('adjusts focus points within 0..max', async () => {
    const actor = makeActor();
    actor.system.resources.focus.value = 2;
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'focus-points',
      delta: -1,
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.resources.focus.value': 1 });
    expect(result.after).toBe(1);
  });

  it('reports null max and has no upper clamp for hp-temp', async () => {
    const actor = makeActor();
    actor.system.attributes.hp.temp = 5;
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'hp-temp',
      delta: 50,
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.temp': 55 });
    expect(result).toEqual({
      actorId: 'actor-1',
      resource: 'hp-temp',
      before: 5,
      after: 55,
      max: null,
    });
  });

  it('clamps hp-temp at 0 for negative delta', async () => {
    const actor = makeActor();
    actor.system.attributes.hp.temp = 3;
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorResourceHandler({
      actorId: 'actor-1',
      resource: 'hp-temp',
      delta: -10,
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.temp': 0 });
    expect(result.after).toBe(0);
  });

  it('treats missing fields as 0 rather than throwing', async () => {
    mockGame.actors.get.mockReturnValue({
      id: 'sparse',
      system: {},
      update: jest.fn().mockResolvedValue(undefined),
    });

    const result = await adjustActorResourceHandler({
      actorId: 'sparse',
      resource: 'hero-points',
      delta: 1,
    });

    expect(result.before).toBe(0);
    expect(result.max).toBe(0);
    expect(result.after).toBe(0); // clamped to max=0
  });

  it('throws when the actor does not exist', async () => {
    mockGame.actors.get.mockReturnValue(undefined);
    await expect(
      adjustActorResourceHandler({
        actorId: 'ghost',
        resource: 'hp',
        delta: 1,
      }),
    ).rejects.toThrow('Actor not found: ghost');
  });
});
