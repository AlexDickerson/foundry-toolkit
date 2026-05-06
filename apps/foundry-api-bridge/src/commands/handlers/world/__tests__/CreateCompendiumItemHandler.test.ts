import { createCompendiumItemHandler } from '../CreateCompendiumItemHandler';
import type { CompendiumItemPayload } from '@/commands/types';

interface MockDocument {
  id: string;
  uuid: string;
  name: string;
  type: string;
}

interface MockPack {
  collection: string;
  metadata: { type: string };
  documentClass: { create: jest.Mock };
}

function makePack(opts: {
  collection?: string;
  type?: string;
  createResult?: MockDocument | MockDocument[] | null;
}): MockPack {
  return {
    collection: opts.collection ?? 'world.homebrew-items',
    metadata: { type: opts.type ?? 'Item' },
    documentClass: {
      create: jest.fn().mockResolvedValue(
        opts.createResult ?? {
          id: 'item-1',
          uuid: 'Compendium.world.homebrew-items.Item.item-1',
          name: 'Sword of Test',
          type: 'weapon',
        },
      ),
    },
  };
}

function setGame(packs: Map<string, MockPack> | undefined): void {
  (globalThis as Record<string, unknown>)['game'] = {
    packs:
      packs !== undefined
        ? {
            get: jest.fn((id: string) => packs.get(id)),
          }
        : undefined,
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

const basePayload: CompendiumItemPayload = {
  name: 'Sword of Test',
  type: 'weapon',
  system: { level: { value: 1 }, traits: { value: [], rarity: 'common' } },
};

describe('createCompendiumItemHandler', () => {
  afterEach(clearGame);

  it('creates an item in the named pack and returns identity fields', async () => {
    const pack = makePack({});
    setGame(new Map([['world.homebrew-items', pack]]));

    const result = await createCompendiumItemHandler({ packId: 'world.homebrew-items', item: basePayload });

    expect(pack.documentClass.create).toHaveBeenCalledTimes(1);
    const [data, options] = pack.documentClass.create.mock.calls[0];
    expect(data).toMatchObject({ name: 'Sword of Test', type: 'weapon' });
    expect(options).toEqual({ pack: 'world.homebrew-items' });
    expect(result).toEqual({
      id: 'item-1',
      uuid: 'Compendium.world.homebrew-items.Item.item-1',
      packId: 'world.homebrew-items',
      name: 'Sword of Test',
      type: 'weapon',
    });
  });

  it('passes through ActiveEffects with normalized defaults', async () => {
    const pack = makePack({});
    setGame(new Map([['world.homebrew-items', pack]]));

    await createCompendiumItemHandler({
      packId: 'world.homebrew-items',
      item: {
        ...basePayload,
        effects: [
          {
            name: '+1 Striking',
            changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1' }],
          },
        ],
      },
    });

    const data = pack.documentClass.create.mock.calls[0][0] as Record<string, unknown>;
    expect(data['effects']).toEqual([
      {
        name: '+1 Striking',
        img: undefined,
        disabled: false,
        transfer: false,
        changes: [{ key: 'system.bonuses.damage.bonus', mode: 2, value: '1' }],
        duration: {},
      },
    ]);
  });

  it('round-trips an item with active effects intact (changes / mode / value preserved)', async () => {
    const pack = makePack({});
    setGame(new Map([['world.homebrew-items', pack]]));

    const effects: CompendiumItemPayload['effects'] = [
      {
        name: 'Resistance',
        disabled: true,
        transfer: true,
        changes: [
          { key: 'system.attributes.resistances.fire', mode: 2, value: '5', priority: 20 },
          { key: 'system.attributes.ac.value', mode: 4, value: '18' },
        ],
        duration: { rounds: 10 },
      },
    ];

    await createCompendiumItemHandler({
      packId: 'world.homebrew-items',
      item: { ...basePayload, effects },
    });

    const data = pack.documentClass.create.mock.calls[0][0] as Record<string, unknown>;
    const persistedEffects = data['effects'] as Record<string, unknown>[];
    expect(persistedEffects).toHaveLength(1);
    expect(persistedEffects[0]).toMatchObject({
      name: 'Resistance',
      disabled: true,
      transfer: true,
      duration: { rounds: 10 },
      changes: [
        { key: 'system.attributes.resistances.fire', mode: 2, value: '5', priority: 20 },
        { key: 'system.attributes.ac.value', mode: 4, value: '18' },
      ],
    });
  });

  it('omits the effects key entirely when none are supplied', async () => {
    const pack = makePack({});
    setGame(new Map([['world.homebrew-items', pack]]));

    await createCompendiumItemHandler({ packId: 'world.homebrew-items', item: basePayload });

    const data = pack.documentClass.create.mock.calls[0][0] as Record<string, unknown>;
    expect(data).not.toHaveProperty('effects');
  });

  it('errors when the pack id is unknown', async () => {
    setGame(new Map());

    await expect(
      createCompendiumItemHandler({ packId: 'world.missing', item: basePayload }),
    ).rejects.toThrow('Compendium pack not found: world.missing');
  });

  it('errors when the pack is not an Item pack', async () => {
    const pack = makePack({ type: 'Actor' });
    setGame(new Map([['world.homebrew-items', pack]]));

    await expect(
      createCompendiumItemHandler({ packId: 'world.homebrew-items', item: basePayload }),
    ).rejects.toThrow(/not an Item pack/);
  });

  it('handles document.create returning an array of one', async () => {
    const pack = makePack({
      createResult: [
        {
          id: 'item-2',
          uuid: 'Compendium.world.homebrew-items.Item.item-2',
          name: 'Sword of Test',
          type: 'weapon',
        },
      ],
    });
    setGame(new Map([['world.homebrew-items', pack]]));

    const result = await createCompendiumItemHandler({ packId: 'world.homebrew-items', item: basePayload });

    expect(result.id).toBe('item-2');
  });
});
