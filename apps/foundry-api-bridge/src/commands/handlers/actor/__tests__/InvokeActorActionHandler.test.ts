import { invokeActorActionHandler, KNOWN_ACTIONS } from '../InvokeActorActionHandler';

interface MockRoll {
  total: number;
  formula: string;
  terms: Array<{ faces?: number; number?: number; results?: Array<{ result: number }> }>;
  isCritical: boolean;
  isFumble: boolean;
}

interface MockItem {
  id: string;
  name: string;
  type: string;
  toMessage: jest.Mock;
}

interface MockActor {
  id: string;
  uuid: string;
  type: string;
  system: Record<string, unknown>;
  items: { get: jest.Mock };
  update: jest.Mock;
  increaseCondition?: jest.Mock;
  decreaseCondition?: jest.Mock;
  getStatistic?: jest.Mock;
}

function setupFoundry(opts: {
  actor: MockActor | null;
  messages?: Array<{ id: string; isRoll?: boolean }>;
  pf2eActions?: Record<string, jest.Mock>;
}): void {
  const actors = new Map<string, MockActor>();
  if (opts.actor) actors.set(opts.actor.id, opts.actor);

  (globalThis as unknown as Record<string, unknown>)['game'] = {
    actors: {
      get: (id: string): MockActor | undefined => actors.get(id),
    },
    messages: { contents: opts.messages ?? [] },
    pf2e: { actions: opts.pf2eActions ?? {} },
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
    items: { get: jest.fn() },
    update: jest.fn().mockResolvedValue(undefined),
    increaseCondition: jest.fn().mockResolvedValue(undefined),
    decreaseCondition: jest.fn().mockResolvedValue(undefined),
    getStatistic: jest.fn().mockReturnValue({ roll: jest.fn().mockResolvedValue(makeRoll()) }),
    ...overrides,
  };
}

function makeItem(overrides: Partial<MockItem> = {}): MockItem {
  return {
    id: 'item1',
    name: 'Potion of Healing',
    type: 'consumable',
    toMessage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)['game'];
});

describe('invokeActorActionHandler — dispatch', () => {
  it('exposes every registered action slug in KNOWN_ACTIONS', () => {
    expect(KNOWN_ACTIONS).toEqual(
      expect.arrayContaining([
        'adjust-resource',
        'adjust-condition',
        'roll-statistic',
        'craft',
        'rest-for-the-night',
        'roll-strike',
        'roll-strike-damage',
        'post-item-to-chat',
        'add-formula',
        'remove-formula',
      ]),
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

describe('invokeActorActionHandler — craft', () => {
  it('invokes game.pf2e.actions.craft with uuid + actors + quantity', async () => {
    const craftMock = jest.fn().mockResolvedValue(undefined);
    const actor = makeActor();
    setupFoundry({ actor, pf2eActions: { craft: craftMock } });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity: 3 },
    });

    expect(craftMock).toHaveBeenCalledWith({
      uuid: 'Compendium.pf2e.equipment-srd.Item.abc',
      actors: [actor],
      quantity: 3,
    });
    expect(result).toEqual({ ok: true });
  });

  it('defaults quantity to 1 when omitted / invalid', async () => {
    const craftMock = jest.fn().mockResolvedValue(undefined);
    setupFoundry({ actor: makeActor(), pf2eActions: { craft: craftMock } });

    for (const quantity of [undefined, -5, 'two', 0]) {
      craftMock.mockClear();
      await invokeActorActionHandler({
        actorId: 'actor1',
        action: 'craft',
        params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity },
      });
      expect(craftMock.mock.calls[0]?.[0]).toMatchObject({ quantity: 1 });
    }
  });

  it('floors non-integer positive quantities', async () => {
    const craftMock = jest.fn().mockResolvedValue(undefined);
    setupFoundry({ actor: makeActor(), pf2eActions: { craft: craftMock } });

    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'craft',
      params: { itemUuid: 'Compendium.pf2e.equipment-srd.Item.abc', quantity: 2.7 },
    });
    expect(craftMock.mock.calls[0]?.[0]).toMatchObject({ quantity: 2 });
  });

  it('requires itemUuid', async () => {
    setupFoundry({ actor: makeActor(), pf2eActions: { craft: jest.fn() } });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'craft', params: {} }),
    ).rejects.toThrow(/params\.itemUuid is required/);
  });

  it('errors when pf2e system is not installed', async () => {
    const actor = makeActor();
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
});

describe('invokeActorActionHandler — rest-for-the-night', () => {
  it('calls game.pf2e.actions.restForTheNight with the actor and skipDialog', async () => {
    const restMock = jest.fn().mockResolvedValue([]);
    const actor = makeActor();
    setupFoundry({ actor, pf2eActions: { restForTheNight: restMock } });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'rest-for-the-night',
      params: {},
    });

    expect(restMock).toHaveBeenCalledWith({ actors: [actor], skipDialog: true });
    expect(result).toEqual({ ok: true, messageCount: 0 });
  });

  it('reports the returned chat message count', async () => {
    const restMock = jest.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
    setupFoundry({ actor: makeActor(), pf2eActions: { restForTheNight: restMock } });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'rest-for-the-night',
      params: {},
    });
    expect(result).toMatchObject({ messageCount: 3 });
  });

  it('refuses to rest a non-character actor', async () => {
    setupFoundry({
      actor: makeActor({ type: 'npc' }),
      pf2eActions: { restForTheNight: jest.fn() },
    });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'rest-for-the-night', params: {} }),
    ).rejects.toThrow(/is a npc, not a character/);
  });

  it('errors when pf2e system is not installed', async () => {
    const actor = makeActor();
    (globalThis as unknown as Record<string, unknown>)['game'] = {
      actors: { get: () => actor },
    };
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'rest-for-the-night', params: {} }),
    ).rejects.toThrow(/pf2e system not installed/);
  });
});

describe('invokeActorActionHandler — roll-strike', () => {
  function makeStrikeActor(): MockActor {
    const variantRoll = jest.fn().mockResolvedValue(undefined);
    return makeActor({
      system: {
        actions: [
          {
            slug: 'longsword',
            variants: [{ roll: variantRoll }, { roll: variantRoll }, { roll: variantRoll }],
            damage: jest.fn().mockResolvedValue(undefined),
            critical: jest.fn().mockResolvedValue(undefined),
          },
          {
            slug: 'bow-composite',
            variants: [{ roll: variantRoll }],
          },
        ],
      },
    });
  }

  it('finds the strike by slug and rolls the requested variant', async () => {
    const actor = makeStrikeActor();
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-strike',
      params: { strikeSlug: 'longsword', variantIndex: 1 },
    });

    const strike = (actor.system as { actions: Array<{ variants: Array<{ roll: jest.Mock }> }> }).actions[0]!;
    // skipDialog: true — suppress PF2e's CheckModifiersDialog for portal-initiated rolls.
    expect(strike.variants[1]!.roll).toHaveBeenCalledWith({ skipDialog: true });
    expect(result).toEqual({ ok: true });
  });

  it('throws when the strike slug is unknown', async () => {
    setupFoundry({ actor: makeStrikeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike',
        params: { strikeSlug: 'greatclub', variantIndex: 0 },
      }),
    ).rejects.toThrow(/strike "greatclub" not found/);
  });

  it('throws when the variant index is out of range', async () => {
    setupFoundry({ actor: makeStrikeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike',
        params: { strikeSlug: 'bow-composite', variantIndex: 2 },
      }),
    ).rejects.toThrow(/has no variant 2/);
  });

  it('rejects non-character actors', async () => {
    setupFoundry({ actor: makeActor({ type: 'npc' }) });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike',
        params: { strikeSlug: 'longsword', variantIndex: 0 },
      }),
    ).rejects.toThrow(/not a character/);
  });

  it('rejects missing strikeSlug and non-integer variantIndex', async () => {
    setupFoundry({ actor: makeStrikeActor() });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'roll-strike', params: { variantIndex: 0 } }),
    ).rejects.toThrow(/strikeSlug is required/);
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike',
        params: { strikeSlug: 'longsword', variantIndex: 1.5 },
      }),
    ).rejects.toThrow(/variantIndex must be a non-negative integer/);
  });

  it('throws when the actor has no system.actions array', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike',
        params: { strikeSlug: 'longsword', variantIndex: 0 },
      }),
    ).rejects.toThrow(/no system\.actions/);
  });
});

describe('invokeActorActionHandler — roll-strike-damage', () => {
  function makeStrikeActor(): MockActor {
    return makeActor({
      system: {
        actions: [
          {
            slug: 'longsword',
            damage: jest.fn().mockResolvedValue(undefined),
            critical: jest.fn().mockResolvedValue(undefined),
          },
        ],
      },
    });
  }

  it('rolls normal damage when critical is false/omitted', async () => {
    const actor = makeStrikeActor();
    setupFoundry({ actor });

    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-strike-damage',
      params: { strikeSlug: 'longsword' },
    });

    const strike = (actor.system as { actions: Array<{ damage: jest.Mock; critical: jest.Mock }> }).actions[0]!;
    // DamageModifierDialog is suppressed via the renderDamageModifierDialog hook,
    // not via params (skipDialog is not in DamageRollParams).
    expect(strike.damage).toHaveBeenCalledWith({});
    expect(strike.critical).not.toHaveBeenCalled();
  });

  it('rolls critical damage when critical is true', async () => {
    const actor = makeStrikeActor();
    setupFoundry({ actor });

    await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'roll-strike-damage',
      params: { strikeSlug: 'longsword', critical: true },
    });

    const strike = (actor.system as { actions: Array<{ damage: jest.Mock; critical: jest.Mock }> }).actions[0]!;
    expect(strike.critical).toHaveBeenCalledWith({});
    expect(strike.damage).not.toHaveBeenCalled();
  });

  it('throws when the strike has no damage/critical function for the requested mode', async () => {
    const bareActor = makeActor({
      system: {
        actions: [{ slug: 'longsword' }],
      },
    });
    setupFoundry({ actor: bareActor });

    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike-damage',
        params: { strikeSlug: 'longsword' },
      }),
    ).rejects.toThrow(/has no damage roll/);

    delete (globalThis as unknown as Record<string, unknown>)['game'];
    setupFoundry({ actor: bareActor });
    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'roll-strike-damage',
        params: { strikeSlug: 'longsword', critical: true },
      }),
    ).rejects.toThrow(/has no critical roll/);
  });
});

describe('invokeActorActionHandler — post-item-to-chat', () => {
  it('calls item.toMessage() and returns {ok, itemId, itemName}', async () => {
    const item = makeItem({ id: 'item-xyz', name: 'Sword of Truth' });
    const actor = makeActor();
    actor.items.get.mockReturnValue(item);
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'post-item-to-chat',
      params: { itemId: 'item-xyz' },
    });

    expect(actor.items.get).toHaveBeenCalledWith('item-xyz');
    expect(item.toMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, itemId: 'item-xyz', itemName: 'Sword of Truth' });
  });

  it('throws when the item is not on the actor', async () => {
    const actor = makeActor();
    actor.items.get.mockReturnValue(undefined);
    setupFoundry({ actor });

    await expect(
      invokeActorActionHandler({
        actorId: 'actor1',
        action: 'post-item-to-chat',
        params: { itemId: 'ghost' },
      }),
    ).rejects.toThrow(/item ghost not found/);
  });

  it('requires itemId', async () => {
    setupFoundry({ actor: makeActor() });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'post-item-to-chat', params: {} }),
    ).rejects.toThrow(/params\.itemId is required/);
  });
});

describe('invokeActorActionHandler — add-formula', () => {
  function actorWithFormulas(formulas: Array<{ uuid: string }>): MockActor {
    return makeActor({
      system: { crafting: { formulas, entries: {} } },
    });
  }

  it('appends a new uuid to system.crafting.formulas and reports added=true', async () => {
    const actor = actorWithFormulas([{ uuid: 'Compendium.pf2e.equipment-srd.Item.healing-elixir' }]);
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'add-formula',
      params: { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
    });

    expect(actor.update).toHaveBeenCalledWith({
      'system.crafting.formulas': [
        { uuid: 'Compendium.pf2e.equipment-srd.Item.healing-elixir' },
        { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
      ],
    });
    expect(result).toEqual({
      ok: true,
      added: true,
      uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser',
      formulaCount: 2,
    });
  });

  it('is a no-op when the formula is already known', async () => {
    const actor = actorWithFormulas([{ uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' }]);
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'add-formula',
      params: { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
    });

    expect(actor.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ added: false, formulaCount: 1 });
  });

  it('handles an empty/missing formulas array', async () => {
    const actor = actorWithFormulas([]);
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'add-formula',
      params: { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
    });

    expect(actor.update).toHaveBeenCalledWith({
      'system.crafting.formulas': [{ uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' }],
    });
    expect(result).toMatchObject({ added: true, formulaCount: 1 });
  });

  it('requires uuid', async () => {
    setupFoundry({ actor: actorWithFormulas([]) });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'add-formula', params: {} }),
    ).rejects.toThrow(/params\.uuid is required/);
  });
});

describe('invokeActorActionHandler — remove-formula', () => {
  function actorWithFormulas(formulas: Array<{ uuid: string }>): MockActor {
    return makeActor({
      system: { crafting: { formulas, entries: {} } },
    });
  }

  it('filters the uuid out and reports removed=true', async () => {
    const actor = actorWithFormulas([
      { uuid: 'Compendium.pf2e.equipment-srd.Item.healing-elixir' },
      { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
    ]);
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'remove-formula',
      params: { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
    });

    expect(actor.update).toHaveBeenCalledWith({
      'system.crafting.formulas': [{ uuid: 'Compendium.pf2e.equipment-srd.Item.healing-elixir' }],
    });
    expect(result).toMatchObject({ removed: true, formulaCount: 1 });
  });

  it('is a no-op when the formula is not known', async () => {
    const actor = actorWithFormulas([{ uuid: 'Compendium.pf2e.equipment-srd.Item.healing-elixir' }]);
    setupFoundry({ actor });

    const result = await invokeActorActionHandler({
      actorId: 'actor1',
      action: 'remove-formula',
      params: { uuid: 'Compendium.pf2e.equipment-srd.Item.bomb-lesser' },
    });

    expect(actor.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ removed: false, formulaCount: 1 });
  });

  it('requires uuid', async () => {
    setupFoundry({ actor: actorWithFormulas([]) });
    await expect(
      invokeActorActionHandler({ actorId: 'actor1', action: 'remove-formula', params: {} }),
    ).rejects.toThrow(/params\.uuid is required/);
  });
});
