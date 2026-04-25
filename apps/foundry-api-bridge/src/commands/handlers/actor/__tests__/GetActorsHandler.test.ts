import { getActorsHandler } from '../GetActorsHandler';

interface MockActor {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
}

function createMockActor(overrides?: Partial<MockActor>): MockActor {
  return {
    id: 'actor-1',
    name: 'Test Actor',
    type: 'character',
    img: 'tokens/actor.webp',
    ...overrides,
  };
}

function setGame(actors: MockActor[]): void {
  (globalThis as Record<string, unknown>)['game'] = {
    actors: {
      forEach: jest.fn((fn: (actor: MockActor) => void) => {
        actors.forEach(fn);
      }),
    },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

describe('getActorsHandler', () => {
  afterEach(() => {
    clearGame();
  });

  it('should return only player character actors, excluding npcs and other types', async () => {
    setGame([
      createMockActor({ id: 'a1', name: 'Gandalf', type: 'npc', img: 'tokens/gandalf.webp' }),
      createMockActor({ id: 'a2', name: 'Frodo', type: 'character', img: 'tokens/frodo.webp' }),
      createMockActor({ id: 'a3', name: 'Wagon', type: 'vehicle', img: 'tokens/wagon.webp' }),
    ]);

    const result = await getActorsHandler({} as Record<string, never>);

    expect(result).toEqual([{ id: 'a2', name: 'Frodo', type: 'character', img: 'tokens/frodo.webp' }]);
  });

  it('should return empty array for empty collection', async () => {
    setGame([]);

    const result = await getActorsHandler({} as Record<string, never>);

    expect(result).toEqual([]);
  });

  it('should return empty array when all actors are non-characters', async () => {
    setGame([
      createMockActor({ id: 'a1', type: 'npc' }),
      createMockActor({ id: 'a2', type: 'vehicle' }),
      createMockActor({ id: 'a3', type: 'familiar' }),
      createMockActor({ id: 'a4', type: 'loot' }),
    ]);

    const result = await getActorsHandler({} as Record<string, never>);

    expect(result).toHaveLength(0);
  });

  it('should fallback img to empty string when undefined', async () => {
    setGame([createMockActor({ id: 'a1', name: 'No Image', img: undefined })]);

    const result = await getActorsHandler({} as Record<string, never>);

    expect(result[0]?.img).toBe('');
  });

  it('should return single character actor as array of one', async () => {
    setGame([createMockActor({ id: 'solo', name: 'Solo' })]);

    const result = await getActorsHandler({} as Record<string, never>);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('solo');
  });

  it('should exclude all non-character actor types', async () => {
    setGame([
      createMockActor({ id: 'c1', type: 'character' }),
      createMockActor({ id: 'n1', type: 'npc' }),
      createMockActor({ id: 'v1', type: 'vehicle' }),
      createMockActor({ id: 'g1', type: 'group' }),
      createMockActor({ id: 'f1', type: 'familiar' }),
      createMockActor({ id: 'l1', type: 'loot' }),
    ]);

    const result = await getActorsHandler({} as Record<string, never>);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c1');
    expect(result[0]?.type).toBe('character');
  });
});
