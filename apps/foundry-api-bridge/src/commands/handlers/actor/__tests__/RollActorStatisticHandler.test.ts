import { rollActorStatisticHandler } from '../RollActorStatisticHandler';

type Roll = {
  total: number;
  formula: string;
  terms: Array<{ faces?: number; number?: number; results?: Array<{ result: number }> }>;
  isCritical: boolean;
  isFumble: boolean;
};

function makeRoll(overrides: Partial<Roll> = {}): Roll {
  return {
    total: 15,
    formula: '1d20+8',
    terms: [{ faces: 20, number: 1, results: [{ result: 7 }] }],
    isCritical: false,
    isFumble: false,
    ...overrides,
  };
}

type Actor = {
  id: string;
  getStatistic: jest.Mock;
};

function makeActor(rollResult: Roll | null = makeRoll()): Actor {
  const statistic = { roll: jest.fn().mockResolvedValue(rollResult) };
  return {
    id: 'actor-1',
    getStatistic: jest.fn().mockReturnValue(statistic),
  };
}

const mockGame: { actors: { get: jest.Mock }; messages?: { contents: Array<{ id: string; isRoll?: boolean }> } } = {
  actors: { get: jest.fn() },
  messages: { contents: [] },
};
(global as Record<string, unknown>)['game'] = mockGame;

describe('rollActorStatisticHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (mockGame.messages) mockGame.messages.contents = [];
  });

  it('rolls via actor.getStatistic(slug).roll() and returns the formatted result', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);

    const result = await rollActorStatisticHandler({
      actorId: 'actor-1',
      statistic: 'perception',
    });

    expect(actor.getStatistic).toHaveBeenCalledWith('perception');
    const statistic = actor.getStatistic.mock.results[0].value as { roll: jest.Mock };
    expect(statistic.roll).toHaveBeenCalledWith({
      skipDialog: true,
      createMessage: true,
      rollMode: undefined,
    });
    expect(result).toEqual({
      statistic: 'perception',
      total: 15,
      formula: '1d20+8',
      dice: [{ type: 'd20', count: 1, results: [7] }],
    });
  });

  it('forwards rollMode when provided', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);

    await rollActorStatisticHandler({
      actorId: 'actor-1',
      statistic: 'stealth',
      rollMode: 'blindroll',
    });

    const statistic = actor.getStatistic.mock.results[0].value as { roll: jest.Mock };
    expect(statistic.roll).toHaveBeenCalledWith({
      skipDialog: true,
      createMessage: true,
      rollMode: 'blindroll',
    });
  });

  it('reports isCritical and isFumble flags when the roll surfaces them', async () => {
    const actor = makeActor(makeRoll({ total: 30, isCritical: true }));
    mockGame.actors.get.mockReturnValue(actor);

    const crit = await rollActorStatisticHandler({ actorId: 'actor-1', statistic: 'fortitude' });
    expect(crit.isCritical).toBe(true);
    expect(crit.isFumble).toBeUndefined();

    const fumbleActor = makeActor(makeRoll({ total: 1, isFumble: true }));
    mockGame.actors.get.mockReturnValue(fumbleActor);
    const fumble = await rollActorStatisticHandler({ actorId: 'actor-1', statistic: 'reflex' });
    expect(fumble.isFumble).toBe(true);
  });

  it('echoes the latest chat message id when it was a roll message', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);
    if (mockGame.messages) {
      mockGame.messages.contents = [{ id: 'msg-abc', isRoll: true }];
    }

    const result = await rollActorStatisticHandler({ actorId: 'actor-1', statistic: 'will' });
    expect(result.chatMessageId).toBe('msg-abc');
  });

  it('omits chatMessageId when the latest message is not a roll', async () => {
    const actor = makeActor();
    mockGame.actors.get.mockReturnValue(actor);
    if (mockGame.messages) {
      mockGame.messages.contents = [{ id: 'msg-plain', isRoll: false }];
    }

    const result = await rollActorStatisticHandler({ actorId: 'actor-1', statistic: 'will' });
    expect(result.chatMessageId).toBeUndefined();
  });

  it('throws when the actor does not exist', async () => {
    mockGame.actors.get.mockReturnValue(undefined);
    await expect(
      rollActorStatisticHandler({ actorId: 'ghost', statistic: 'perception' }),
    ).rejects.toThrow('Actor not found: ghost');
  });

  it('throws a clear error on non-pf2e actors that lack getStatistic', async () => {
    mockGame.actors.get.mockReturnValue({ id: 'vanilla' });
    await expect(
      rollActorStatisticHandler({ actorId: 'vanilla', statistic: 'perception' }),
    ).rejects.toThrow(/pf2e system actor/);
  });

  it('throws when the statistic is not defined on the actor', async () => {
    const actor = makeActor();
    actor.getStatistic.mockReturnValue(null);
    mockGame.actors.get.mockReturnValue(actor);

    await expect(
      rollActorStatisticHandler({ actorId: 'actor-1', statistic: 'athletics' }),
    ).rejects.toThrow('Statistic "athletics" not available');
  });

  it('throws when roll() returns null (e.g. user cancel)', async () => {
    const actor = makeActor(null);
    mockGame.actors.get.mockReturnValue(actor);

    await expect(
      rollActorStatisticHandler({ actorId: 'actor-1', statistic: 'perception' }),
    ).rejects.toThrow('Roll for "perception" returned no result');
  });
});
