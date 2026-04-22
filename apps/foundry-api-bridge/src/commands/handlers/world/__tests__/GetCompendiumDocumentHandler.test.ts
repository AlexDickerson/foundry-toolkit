import { getCompendiumDocumentHandler } from '../GetCompendiumDocumentHandler';

interface MockDoc {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string | null;
  // `toObject(false)` is the live Foundry call the bridge uses to grab
  // the source slice plus (for Actors) the prototypeToken payload.
  toObject: jest.Mock;
}

function setFromUuid(doc: MockDoc | null): jest.Mock {
  const fromUuid = jest.fn().mockResolvedValue(doc);
  (globalThis as Record<string, unknown>)['fromUuid'] = fromUuid;
  return fromUuid;
}

function clearFromUuid(): void {
  delete (globalThis as Record<string, unknown>)['fromUuid'];
}

describe('getCompendiumDocumentHandler', () => {
  afterEach(clearFromUuid);

  it('returns Actor tokenImg read from prototypeToken.texture.src', async () => {
    const dragon: MockDoc = {
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
    setFromUuid(dragon);

    const result = await getCompendiumDocumentHandler({
      uuid: 'Compendium.pf2e.pathfinder-bestiary.Actor.young-red-dragon',
    });

    expect(result.document.tokenImg).toBe('/icons/dragon-token.webp');
    expect(result.document.img).toBe('/icons/dragon-portrait.webp');
  });

  it('omits tokenImg for Item documents', async () => {
    const javelin: MockDoc = {
      id: 'javelin',
      uuid: 'Compendium.pf2e.equipment-srd.Item.javelin',
      name: 'Javelin',
      type: 'weapon',
      img: '/icons/javelin.webp',
      // Items have no prototypeToken — the handler should leave the
      // field off the outgoing payload entirely (not emit `undefined`).
      toObject: jest.fn().mockReturnValue({ system: { traits: { value: ['thrown-30'] } } }),
    };
    setFromUuid(javelin);

    const result = await getCompendiumDocumentHandler({
      uuid: 'Compendium.pf2e.equipment-srd.Item.javelin',
    });

    expect(result.document).not.toHaveProperty('tokenImg');
  });

  it('rejects when the uuid resolves to nothing', async () => {
    setFromUuid(null);

    await expect(
      getCompendiumDocumentHandler({ uuid: 'Compendium.pf2e.missing.Item.nope' }),
    ).rejects.toThrow('Compendium document not found: Compendium.pf2e.missing.Item.nope');
  });
});
