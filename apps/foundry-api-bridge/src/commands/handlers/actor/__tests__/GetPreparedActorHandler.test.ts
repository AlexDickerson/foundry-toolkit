import { getPreparedActorHandler } from '../GetPreparedActorHandler';

interface MockItem {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  toObject: jest.Mock;
}

function makeItem(overrides: Partial<MockItem> & { id: string; type: string }): MockItem {
  return {
    name: 'Test Item',
    img: 'icons/test.webp',
    toObject: jest.fn().mockReturnValue({ system: {} }),
    ...overrides,
  };
}

function setGame(items: MockItem[]): void {
  (globalThis as Record<string, unknown>)['game'] = {
    actors: {
      get: jest.fn((_id: string) => ({
        id: 'actor-1',
        uuid: 'Actor.actor-1',
        name: 'Test Actor',
        type: 'character',
        img: 'tokens/test.webp',
        items: {
          forEach: jest.fn((fn: (item: MockItem) => void) => {
            items.forEach(fn);
          }),
        },
        toObject: jest.fn().mockReturnValue({ system: { hp: 20 }, flags: {} }),
      })),
    },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

describe('getPreparedActorHandler', () => {
  afterEach(clearGame);

  it('rejects when actor not found', async () => {
    (globalThis as Record<string, unknown>)['game'] = {
      actors: { get: jest.fn().mockReturnValue(undefined) },
    };
    await expect(getPreparedActorHandler({ actorId: 'missing' })).rejects.toThrow('Actor not found: missing');
  });

  it('returns statusEffects as empty array when actor has no conditions or effects', async () => {
    setGame([makeItem({ id: 'i1', type: 'weapon', toObject: jest.fn().mockReturnValue({ system: {} }) })]);
    const result = await getPreparedActorHandler({ actorId: 'actor-1' });
    expect(result.statusEffects).toEqual([]);
  });

  it('includes a valued condition (frightened-2) with badge', async () => {
    setGame([
      makeItem({
        id: 'c1',
        name: 'Frightened',
        type: 'condition',
        img: 'icons/frightened.webp',
        toObject: jest.fn().mockReturnValue({
          system: {
            slug: 'frightened',
            badge: { type: 'value', value: 2 },
            description: { value: '<p>You are afraid.</p>' },
          },
        }),
      }),
    ]);
    const result = await getPreparedActorHandler({ actorId: 'actor-1' });
    expect(result.statusEffects).toHaveLength(1);
    expect(result.statusEffects[0]).toMatchObject({
      id: 'c1',
      name: 'Frightened',
      slug: 'frightened',
      img: 'icons/frightened.webp',
      badge: { type: 'value', value: 2 },
      description: 'You are afraid.',
      fromSpell: false,
    });
  });

  it('excludes dying, wounded, and doomed conditions', async () => {
    setGame(
      ['dying', 'wounded', 'doomed'].map((slug, i) =>
        makeItem({
          id: `skip-${i.toString()}`,
          name: slug,
          type: 'condition',
          toObject: jest.fn().mockReturnValue({ system: { slug } }),
        }),
      ),
    );
    const result = await getPreparedActorHandler({ actorId: 'actor-1' });
    expect(result.statusEffects).toHaveLength(0);
  });

  it('includes an effect with fromSpell=true', async () => {
    setGame([
      makeItem({
        id: 'e1',
        name: 'Bless',
        type: 'effect',
        img: 'icons/bless.webp',
        toObject: jest.fn().mockReturnValue({
          system: {
            slug: 'bless',
            fromSpell: true,
            description: { value: '<p>Allies gain +1 to attack rolls.</p>' },
          },
        }),
      }),
    ]);
    const result = await getPreparedActorHandler({ actorId: 'actor-1' });
    expect(result.statusEffects).toHaveLength(1);
    expect(result.statusEffects[0]).toMatchObject({
      id: 'e1',
      name: 'Bless',
      slug: 'bless',
      fromSpell: true,
      description: 'Allies gain +1 to attack rolls.',
    });
    expect(result.statusEffects[0]?.badge).toBeUndefined();
  });

  it('strips HTML from descriptions', async () => {
    setGame([
      makeItem({
        id: 'c2',
        name: 'Sickened',
        type: 'condition',
        toObject: jest.fn().mockReturnValue({
          system: {
            slug: 'sickened',
            badge: { type: 'value', value: 1 },
            description: { value: '<p>You are <b>sickened</b>.<br/>Apply a −1 penalty.</p>' },
          },
        }),
      }),
    ]);
    const result = await getPreparedActorHandler({ actorId: 'actor-1' });
    expect(result.statusEffects[0]?.description).toBe('You are sickened. Apply a −1 penalty.');
  });

  it('includes non-skippped conditions alongside regular items', async () => {
    setGame([
      makeItem({ id: 'w1', type: 'weapon', toObject: jest.fn().mockReturnValue({ system: {} }) }),
      makeItem({
        id: 'c3',
        name: 'Off-Guard',
        type: 'condition',
        toObject: jest.fn().mockReturnValue({ system: { slug: 'off-guard' } }),
      }),
    ]);
    const result = await getPreparedActorHandler({ actorId: 'actor-1' });
    expect(result.items).toHaveLength(2);
    expect(result.statusEffects).toHaveLength(1);
    expect(result.statusEffects[0]?.slug).toBe('off-guard');
  });
});
