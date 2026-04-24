import { invokeActorActionHandler, KNOWN_ACTIONS } from '../InvokeActorActionHandler';

interface MockRoll {
  total: number;
  formula: string;
  terms: Array<{ faces?: number; number?: number; results?: Array<{ result: number }> }>;
  isCritical: boolean;
  isFumble: boolean;
}

interface MockActor {
  id: string;
  uuid: string;
  type: string;
  system: Record<string, unknown>;
  update: jest.Mock;
  increaseCondition?: jest.Mock;
  decreaseCondition?: jest.Mock;
  getStatistic?: jest.Mock;
}

function setupFoundry(opts: {
  actor: MockActor | null;
  messages?: Array<{ id: string; isRoll?: boolean }>;
}): void {
  const actors = new Map<string, MockActor>();
  if (opts.actor) actors.set(opts.actor.id, opts.actor);

  (globalThis as unknown as Record<string, unknown>)['game'] = {
    actors: {
      get: (id: string): MockActor | undefined => actors.get(id),
    },
    messages: { contents: opts.messages ?? [] },
  };
}

function makeRoll(overrides: Partial<MockRoll> = {}): MockRoll {
  return {
    total: 15,
    formula: '1d20+8',
    terms: [{ faces: 20, number: 1, results: [{ result: 7 }] }],
    isCritical: false,
    isFumble: false,
    ...overrides,
  };
}

function makeActor(overrides: Partial<MockActor> = {}): MockActor {
  return {
    id: 'actor1',
    uuid: 'Actor.actor1',
    type: 'character',
    system: {
      attributes: {
        hp: { value: 10, max: 22, temp: 0 },
        dying: { value: 0, max: 4 },
        wounded: { value: 0, max: 3 },
        doomed: { value: 0, max: 3 },
      },
      resources: {
        heroPoints: { value: 1, max: 3 },
        focus: { value: 0, max: 2 },
      },
    },
    update: jest.fn().mockResolvedValue(undefined),
    increaseCondition: jest.fn().mockResolvedValue(undefined),
    decreaseCondition: jest.fn().mockResolvedValue(undefined),
    getStatistic: jest.fn().mockReturnValue({ roll: jest.fn().mockResolvedValue(makeRoll()) }),
    ...overrides,
  };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['game'];
});

describe('invokeActorActionHandler — dispatch', () => {
  it('exposes adjust-resource, adjust-condition, roll-statistic in KNOWN_ACTIONS', () => {
    expect(KNOWN_ACTIONS).toEqual(
      expect.arrayContaining(['adjust-resource', 'adjust-condition', 'roll-statistic']),
    );
  });

  it('throws when the actor is missing', async () => {
    setupFoundry({ actor: null });
    await expect(
      invokeActorActionHandler({ actorId: 'missing', action: 'adjust-resource', params: {} }),
    ).rejects.toThrow(/Actor not found: missing/);
  });

  it('throws on an unknown action with a helpful list', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'nope', params: {} }),
    ).rejects.toThrow(/Unknown action: nope.*adjust-resource/);
  });

  it('defaults params to an empty object when omitted', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'adjust-resource' } as Parameters<
        typeof invokeActorActionHandler
      >[0]),
    ).rejects.toThrow(/params\.resource must be/);
  });
});

describe('invokeActorActionHandler — adjust-resource', () => {
  it('heals HP by positive delta and clamps at max', async () => {
    const actor = makeActor();
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-resource',
      params: { resource: 'hp', delta: 20 },
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.value': 22 });
    expect(result).toEqual({
      actorId: 'actor1',
      resource: 'hp',
      before: 10,
      after: 22,
      max: 22,
    });
  });

  it('damages HP by negative delta and clamps at 0', async () => {
    const actor = makeActor();
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-resource',
      params: { resource: 'hp', delta: -25 },
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.value': 0 });
    expect(result).toMatchObject({ after: 0 });
  });

  it('skips update when delta would not change the clamped value', async () => {
    const actor = makeActor();
    (actor.system as { attributes: { hp: { value: number } } }).attributes.hp.value = 22;
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-resource',
      params: { resource: 'hp', delta: 10 },
    });

    expect(actor.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ before: 22, after: 22, max: 22 });
  });

  it('reports null max and has no upper clamp for hp-temp', async () => {
    const actor = makeActor();
    (actor.system as { attributes: { hp: { temp: number } } }).attributes.hp.temp = 5;
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-resource',
      params: { resource: 'hp-temp', delta: 50 },
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.hp.temp': 55 });
    expect(result).toMatchObject({ before: 5, after: 55, max: null });
  });

  it('adjusts hero points within [0, max]', async () => {
    const actor = makeActor();
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-resource',
      params: { resource: 'hero-points', delta: 5 },
    });

    expect(actor.update).toHaveBeenCalledWith({ 'system.resources.heroPoints.value': 3 });
    expect(result).toMatchObject({ before: 1, after: 3, max: 3 });
  });

  it('treats missing fields as 0 rather than throwing', async () => {
    const actor = makeActor({ system: {} });
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-resource',
      params: { resource: 'hero-points', delta: 1 },
    });

    expect(result).toMatchObject({ before: 0, after: 0, max: 0 });
  });

  it('rejects unknown resource keys', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'adjust-resource',
        params: { resource: 'mana', delta: 1 },
      }),
    ).rejects.toThrow(/adjust-resource: params\.resource must be one of/);
  });

  it('rejects non-integer delta', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'adjust-resource',
        params: { resource: 'hp', delta: 1.5 },
      }),
    ).rejects.toThrow(/params\.delta must be an integer/);
  });
});

describe('invokeActorActionHandler — adjust-condition', () => {
  it('calls increaseCondition once per positive delta', async () => {
    const actor = makeActor();
    actor.increaseCondition!.mockImplementation(async () => {
      (actor.system as { attributes: { dying: { value: number } } }).attributes.dying.value += 1;
    });
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-condition',
      params: { condition: 'dying', delta: 2 },
    });

    expect(actor.increaseCondition).toHaveBeenCalledTimes(2);
    expect(actor.increaseCondition).toHaveBeenCalledWith('dying');
    expect(actor.decreaseCondition).not.toHaveBeenCalled();
    expect(result).toEqual({
      actorId: 'actor1',
      condition: 'dying',
      before: 0,
      after: 2,
      max: 4,
    });
  });

  it('calls decreaseCondition once per unit of negative delta', async () => {
    const actor = makeActor();
    (actor.system as { attributes: { wounded: { value: number } } }).attributes.wounded.value = 3;
    actor.decreaseCondition!.mockImplementation(async () => {
      (actor.system as { attributes: { wounded: { value: number } } }).attributes.wounded.value -= 1;
    });
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-condition',
      params: { condition: 'wounded', delta: -2 },
    });

    expect(actor.decreaseCondition).toHaveBeenCalledTimes(2);
    expect(actor.decreaseCondition).toHaveBeenCalledWith('wounded');
    expect(actor.increaseCondition).not.toHaveBeenCalled();
    expect(result).toMatchObject({ before: 3, after: 1 });
  });

  it('no-ops on zero delta and still reports current state', async () => {
    const actor = makeActor();
    (actor.system as { attributes: { doomed: { value: number } } }).attributes.doomed.value = 2;
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-condition',
      params: { condition: 'doomed', delta: 0 },
    });

    expect(actor.increaseCondition).not.toHaveBeenCalled();
    expect(actor.decreaseCondition).not.toHaveBeenCalled();
    expect(result).toMatchObject({ before: 2, after: 2, max: 3 });
  });

  it('reports the post-call max (dying cap shifts with doomed)', async () => {
    const actor = makeActor();
    actor.increaseCondition!.mockImplementation(async () => {
      const attrs = (actor.system as { attributes: { dying: { value: number; max: number } } }).attributes;
      attrs.dying.value += 1;
      attrs.dying.max = 5;
    });
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'adjust-condition',
      params: { condition: 'dying', delta: 1 },
    });

    expect(result).toMatchObject({ max: 5 });
  });

  it('throws a clear error on non-pf2e actors that lack increaseCondition', async () => {
    const actor = makeActor();
    delete actor.increaseCondition;
    delete actor.decreaseCondition;
    setupFoundry({ actor });

    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'adjust-condition',
        params: { condition: 'dying', delta: 1 },
      }),
    ).rejects.toThrow(/pf2e system actor/);
  });

  it('rejects unknown condition keys', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'adjust-condition',
        params: { condition: 'frightened', delta: 1 },
      }),
    ).rejects.toThrow(/adjust-condition: params\.condition must be one of/);
  });

  it('rejects non-integer delta', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'adjust-condition',
        params: { condition: 'dying', delta: 1.5 },
      }),
    ).rejects.toThrow(/params\.delta must be an integer/);
  });
});

describe('invokeActorActionHandler — roll-statistic', () => {
  it('rolls via actor.getStatistic(slug).roll() and returns the formatted result', async () => {
    const actor = makeActor();
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-statistic',
      params: { statistic: 'perception' },
    });

    expect(actor.getStatistic).toHaveBeenCalledWith('perception');
    const stat = (actor.getStatistic as jest.Mock).mock.results[0]!.value as { roll: jest.Mock };
    expect(stat.roll).toHaveBeenCalledWith({
      skipDialog: true,
      createMessage: true,
    });
    expect(result).toMatchObject({
      statistic: 'perception',
      total: 15,
      formula: '1d20+8',
      dice: [{ type: 'd20', count: 1, results: [7] }],
    });
  });

  it('forwards rollMode when provided', async () => {
    const actor = makeActor();
    setupFoundry({ actor });

    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-statistic',
      params: { statistic: 'stealth', rollMode: 'blindroll' },
    });

    const stat = (actor.getStatistic as jest.Mock).mock.results[0]!.value as { roll: jest.Mock };
    expect(stat.roll).toHaveBeenCalledWith({
      skipDialog: true,
      createMessage: true,
      rollMode: 'blindroll',
    });
  });

  it('reports isCritical / isFumble flags when the roll surfaces them', async () => {
    const critActor = makeActor({
      getStatistic: jest
        .fn()
        .mockReturnValue({ roll: jest.fn().mockResolvedValue(makeRoll({ total: 30, isCritical: true })) }),
    });
    setupFoundry({ actor: critActor });
    const crit = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-statistic',
      params: { statistic: 'fortitude' },
    });
    expect(crit['isCritical']).toBe(true);
    expect(crit['isFumble']).toBeUndefined();

    delete (globalThis as unknown as Record<string, unknown>)['game'];
    const fumbleActor = makeActor({
      getStatistic: jest
        .fn()
        .mockReturnValue({ roll: jest.fn().mockResolvedValue(makeRoll({ total: 1, isFumble: true })) }),
    });
    setupFoundry({ actor: fumbleActor });
    const fumble = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-statistic',
      params: { statistic: 'reflex' },
    });
    expect(fumble['isFumble']).toBe(true);
  });

  it('echoes the latest chat message id when it was a roll message', async () => {
    const actor = makeActor();
    setupFoundry({ actor, messages: [{ id: 'msg-abc', isRoll: true }] });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-statistic',
      params: { statistic: 'will' },
    });
    expect(result['chatMessageId']).toBe('msg-abc');
  });

  it('omits chatMessageId when the latest message is not a roll', async () => {
    const actor = makeActor();
    setupFoundry({ actor, messages: [{ id: 'msg-plain', isRoll: false }] });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-statistic',
      params: { statistic: 'will' },
    });
    expect(result['chatMessageId']).toBeUndefined();
  });

  it('throws a clear error on non-pf2e actors that lack getStatistic', async () => {
    const actor = makeActor();
    delete actor.getStatistic;
    setupFoundry({ actor });

    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-statistic',
        params: { statistic: 'perception' },
      }),
    ).rejects.toThrow(/pf2e system actor/);
  });

  it('throws when the statistic is not defined on the actor', async () => {
    const actor = makeActor({ getStatistic: jest.fn().mockReturnValue(null) });
    setupFoundry({ actor });

    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-statistic',
        params: { statistic: 'athletics' },
      }),
    ).rejects.toThrow(/not available on actor/);
  });

  it('throws when roll() returns null (e.g. user cancel)', async () => {
    const actor = makeActor({
      getStatistic: jest.fn().mockReturnValue({ roll: jest.fn().mockResolvedValue(null) }),
    });
    setupFoundry({ actor });

    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-statistic',
        params: { statistic: 'perception' },
      }),
    ).rejects.toThrow(/returned no result/);
  });

  it('rejects unknown statistic slugs', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-statistic',
        params: { statistic: 'underwater-basket-weaving' },
      }),
    ).rejects.toThrow(/params\.statistic must be one of/);
  });

  it('rejects unknown rollMode when provided', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-statistic',
        params: { statistic: 'perception', rollMode: 'whisper' },
      }),
    ).rejects.toThrow(/params\.rollMode must be one of/);
  });
});
