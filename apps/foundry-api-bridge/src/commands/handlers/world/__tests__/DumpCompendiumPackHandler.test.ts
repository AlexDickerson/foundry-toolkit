import { dumpCompendiumPackHandler } from '../DumpCompendiumPackHandler';

interface MockDoc {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string | null;
  // Mirrors a Foundry document's `toObject(false)` — the dump handler
  // uses the return value for the `system` slice and (via the
  // `extractTokenImg` helper) any `prototypeToken.texture.src` living
  // on Actor documents.
  toObject: jest.Mock;
}

interface MockPack {
  collection: string;
  metadata: { label: string; type: string; system: string | undefined; packageName: string };
  getDocuments: jest.Mock<Promise<MockDoc[]>, []>;
}

function setGame(pack: MockPack): void {
  (globalThis as Record<string, unknown>)['game'] = {
    packs: { get: jest.fn((id: string) => (id === pack.collection ? pack : undefined)) },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

describe('dumpCompendiumPackHandler', () => {
  afterEach(clearGame);

  it('maps documents and passes Actor tokenImg through from prototypeToken.texture.src', async () => {
    const dragonDoc: MockDoc = {
      id: 'young-red-dragon',
      uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.young-red-dragon',
      name: 'Young Red Dragon',
      type: 'npc',
      img: '/icons/dragon-portrait.webp',
      toObject: jest.fn().mockReturnValue({
        system: { details: { level: { value: 10 } } },
        prototypeToken: { texture: { src: '/icons/dragon-token.webp' } },
      }),
    };
    const pack: MockPack = {
      collection: 'pf2e.pathfinder-bestiary',
      metadata: { label: 'Bestiary', type: 'Actor', system: 'pf2e', packageName: 'pf2e' },
      getDocuments: jest.fn().mockResolvedValue([dragonDoc]),
    };
    setGame(pack);

    const result = await dumpCompendiumPackHandler({ packId: 'pf2e.pathfinder-bestiary' });

    expect(result.documents[0]).toMatchObject({
      id: 'young-red-dragon',
      img: '/icons/dragon-portrait.webp',
      tokenImg: '/icons/dragon-token.webp',
    });
  });

  it('omits tokenImg for Item documents without a prototypeToken', async () => {
    const itemDoc: MockDoc = {
      id: 'javelin',
      uuid: 'Compendium.pf2e.equipment-srd.Item.javelin',
      name: 'Javelin',
      type: 'weapon',
      img: '/icons/javelin.webp',
      // Item `toObject(false)` has no `prototypeToken` key — the
      // handler must leave `tokenImg` off the wire payload entirely.
      toObject: jest.fn().mockReturnValue({ system: { traits: { value: ['thrown-30'] } } }),
    };
    const pack: MockPack = {
      collection: 'pf2e.equipment-srd',
      metadata: { label: 'Equipment', type: 'Item', system: 'pf2e', packageName: 'pf2e' },
      getDocuments: jest.fn().mockResolvedValue([itemDoc]),
    };
    setGame(pack);

    const result = await dumpCompendiumPackHandler({ packId: 'pf2e.equipment-srd' });

    expect(result.documents[0]).not.toHaveProperty('tokenImg');
    expect(result.documents[0]?.img).toBe('/icons/javelin.webp');
  });

  it('rejects when the requested pack is missing', async () => {
    setGame({
      collection: 'pf2e.other',
      metadata: { label: 'Other', type: 'Item', system: 'pf2e', packageName: 'pf2e' },
      getDocuments: jest.fn().mockResolvedValue([]),
    });

    await expect(dumpCompendiumPackHandler({ packId: 'pf2e.missing' })).rejects.toThrow(
      'Compendium pack not found: pf2e.missing',
    );
  });
});
