import { getPartyStashHandler } from '../GetPartyStashHandler';

interface MockItem {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  toObject: jest.Mock;
}

interface MockPartyActor {
  id: string;
  type: string;
  items: {
    forEach: jest.Mock;
  };
}

function makeItem(overrides?: Partial<MockItem>): MockItem {
  return {
    id: 'itm-1',
    name: 'Healing Potion',
    type: 'consumable',
    img: 'img/potion.webp',
    toObject: jest.fn(() => ({ system: { quantity: 2, price: { value: 3, denomination: 'gp' } } })),
    ...overrides,
  };
}

function makePartyActor(items: MockItem[], overrides?: Partial<MockPartyActor>): MockPartyActor {
  return {
    id: 'party-1',
    type: 'party',
    items: {
      forEach: jest.fn((fn: (item: MockItem) => void) => items.forEach(fn)),
    },
    ...overrides,
  };
}

function setGame(actorById: Record<string, MockPartyActor>): void {
  (globalThis as Record<string, unknown>)['game'] = {
    actors: {
      get: jest.fn((id: string) => actorById[id]),
    },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

describe('getPartyStashHandler', () => {
  afterEach(() => clearGame());

  it('returns items from the party actor', async () => {
    const item = makeItem();
    setGame({ 'party-1': makePartyActor([item]) });

    const result = await getPartyStashHandler({ partyActorId: 'party-1' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'itm-1',
      name: 'Healing Potion',
      type: 'consumable',
      img: 'img/potion.webp',
    });
    expect(item.toObject).toHaveBeenCalledWith(false);
  });

  it('returns empty items array when party has no items', async () => {
    setGame({ 'party-1': makePartyActor([]) });

    const result = await getPartyStashHandler({ partyActorId: 'party-1' });

    expect(result.items).toEqual([]);
  });

  it('rejects when the actor is not found', async () => {
    setGame({});

    await expect(getPartyStashHandler({ partyActorId: 'missing-id' })).rejects.toThrow(
      'Party actor not found: missing-id',
    );
  });

  it('rejects when the actor is not a party type', async () => {
    const nonParty = makePartyActor([], { type: 'character' });
    setGame({ 'chr-1': nonParty });

    await expect(getPartyStashHandler({ partyActorId: 'chr-1' })).rejects.toThrow(
      'not a party actor',
    );
  });

  it('falls back img to empty string when item img is undefined', async () => {
    const item = makeItem({ img: undefined });
    setGame({ 'party-1': makePartyActor([item]) });

    const result = await getPartyStashHandler({ partyActorId: 'party-1' });

    expect(result.items[0]?.img).toBe('');
  });

  it('returns multiple items in iteration order', async () => {
    const items = [
      makeItem({ id: 'i1', name: 'Rope' }),
      makeItem({ id: 'i2', name: 'Torch' }),
      makeItem({ id: 'i3', name: 'Rations' }),
    ];
    setGame({ 'party-1': makePartyActor(items) });

    const result = await getPartyStashHandler({ partyActorId: 'party-1' });

    expect(result.items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it('includes the system data from toObject(false)', async () => {
    const sysData = { quantity: 5, bulk: { value: 'L' } };
    const item = makeItem({ toObject: jest.fn(() => ({ system: sysData })) });
    setGame({ 'party-1': makePartyActor([item]) });

    const result = await getPartyStashHandler({ partyActorId: 'party-1' });

    expect(result.items[0]?.system).toEqual(sysData);
  });
});
