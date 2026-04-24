import { adjustActorConditionHandler } from '../AdjustActorConditionHandler';

type ActorSystem = {
  attributes: {
    dying: { value: number; max: number };
    wounded: { value: number; max: number };
    doomed: { value: number; max: number };
  };
};

type Actor = {
  id: string;
  system: ActorSystem;
  increaseCondition: jest.Mock;
  decreaseCondition: jest.Mock;
};

function makeActor(): Actor {
  return {
    id: 'actor-1',
    system: {
      attributes: {
        dying: { value: 0, max: 4 },
        wounded: { value: 0, max: 3 },
        doomed: { value: 0, max: 3 },
      },
    },
    increaseCondition: jest.fn(),
    decreaseCondition: jest.fn(),
  };
}

const mockGame = { actors: { get: jest.fn() } };
(global as Record<string, unknown>)['game'] = mockGame;

describe('adjustActorConditionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls increaseCondition once per positive delta', async () => {
    const actor = makeActor();
    // Simulate the PF2e behaviour: each call bumps value by 1.
    actor.increaseCondition.mockImplementation(async () => {
      actor.system.attributes.dying.value += 1;
    });
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorConditionHandler({
      actorId: 'actor-1',
      condition: 'dying',
      delta: 2,
    });

    expect(actor.increaseCondition).toHaveBeenCalledTimes(2);
    expect(actor.increaseCondition).toHaveBeenCalledWith('dying');
    expect(actor.decreaseCondition).not.toHaveBeenCalled();
    expect(result).toEqual({
      actorId: 'actor-1',
      condition: 'dying',
      before: 0,
      after: 2,
      max: 4,
    });
  });

  it('calls decreaseCondition once per unit of negative delta', async () => {
    const actor = makeActor();
    actor.system.attributes.wounded.value = 3;
    actor.decreaseCondition.mockImplementation(async () => {
      actor.system.attributes.wounded.value -= 1;
    });
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorConditionHandler({
      actorId: 'actor-1',
      condition: 'wounded',
      delta: -2,
    });

    expect(actor.decreaseCondition).toHaveBeenCalledTimes(2);
    expect(actor.decreaseCondition).toHaveBeenCalledWith('wounded');
    expect(actor.increaseCondition).not.toHaveBeenCalled();
    expect(result.before).toBe(3);
    expect(result.after).toBe(1);
  });

  it('no-ops on zero delta and still reports current state', async () => {
    const actor = makeActor();
    actor.system.attributes.doomed.value = 2;
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorConditionHandler({
      actorId: 'actor-1',
      condition: 'doomed',
      delta: 0,
    });

    expect(actor.increaseCondition).not.toHaveBeenCalled();
    expect(actor.decreaseCondition).not.toHaveBeenCalled();
    expect(result).toEqual({
      actorId: 'actor-1',
      condition: 'doomed',
      before: 2,
      after: 2,
      max: 3,
    });
  });

  it('reports the post-call max (matters for dying as doomed shifts its cap)', async () => {
    const actor = makeActor();
    // Simulate doomed's effect on dying.max: after increase, max grows.
    actor.increaseCondition.mockImplementation(async () => {
      actor.system.attributes.dying.value += 1;
      actor.system.attributes.dying.max = 5; // e.g. doomed 1 bumped cap to 5
    });
    mockGame.actors.get.mockReturnValue(actor);

    const result = await adjustActorConditionHandler({
      actorId: 'actor-1',
      condition: 'dying',
      delta: 1,
    });

    expect(result.max).toBe(5);
  });

  it('throws when the actor does not exist', async () => {
    mockGame.actors.get.mockReturnValue(undefined);
    await expect(
      adjustActorConditionHandler({ actorId: 'ghost', condition: 'dying', delta: 1 }),
    ).rejects.toThrow('Actor not found: ghost');
  });

  it('throws a clear error on non-pf2e actors that lack increaseCondition', async () => {
    mockGame.actors.get.mockReturnValue({
      id: 'vanilla',
      system: {},
      // No condition methods — simulates a 5e or other-system actor.
    });
    await expect(
      adjustActorConditionHandler({ actorId: 'vanilla', condition: 'dying', delta: 1 }),
    ).rejects.toThrow(/pf2e system actor/);
  });
});
