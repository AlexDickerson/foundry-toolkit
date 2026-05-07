import { ensureCompendiumPackHandler } from '../EnsureCompendiumPackHandler';

interface MockPackMetadata {
  label: string;
  type: string;
}

interface MockPack {
  collection: string;
  metadata: MockPackMetadata;
}

function setEnv(packs: Map<string, MockPack> | undefined, createImpl?: jest.Mock): void {
  const packsCollection =
    packs !== undefined
      ? {
          get: jest.fn((id: string) => packs.get(id)),
        }
      : undefined;
  (globalThis as Record<string, unknown>)['game'] = { packs: packsCollection };
  (globalThis as Record<string, unknown>)['CompendiumCollection'] =
    createImpl !== undefined ? { createCompendium: createImpl } : undefined;
}

function clearEnv(): void {
  delete (globalThis as Record<string, unknown>)['game'];
  delete (globalThis as Record<string, unknown>)['CompendiumCollection'];
}

describe('ensureCompendiumPackHandler', () => {
  afterEach(clearEnv);

  it('creates a new world pack when none exists', async () => {
    const create = jest.fn().mockResolvedValue({
      collection: 'world.homebrew-items',
      metadata: { label: 'Homebrew Items', type: 'Item' },
    });
    setEnv(new Map(), create);

    const result = await ensureCompendiumPackHandler({ name: 'homebrew-items', label: 'Homebrew Items' });

    expect(create).toHaveBeenCalledWith({
      name: 'homebrew-items',
      label: 'Homebrew Items',
      type: 'Item',
      packageType: 'world',
    });
    expect(result).toEqual({
      id: 'world.homebrew-items',
      label: 'Homebrew Items',
      type: 'Item',
      created: true,
    });
  });

  it('reuses an existing pack with the same id and type', async () => {
    const create = jest.fn();
    const existing: MockPack = {
      collection: 'world.homebrew-items',
      metadata: { label: 'Homebrew Items', type: 'Item' },
    };
    setEnv(new Map([['world.homebrew-items', existing]]), create);

    const result = await ensureCompendiumPackHandler({ name: 'homebrew-items', label: 'Homebrew Items' });

    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'world.homebrew-items',
      label: 'Homebrew Items',
      type: 'Item',
      created: false,
    });
  });

  it('errors when an existing pack has a conflicting type', async () => {
    const create = jest.fn();
    const existing: MockPack = {
      collection: 'world.homebrew-items',
      metadata: { label: 'Homebrew Items', type: 'Actor' },
    };
    setEnv(new Map([['world.homebrew-items', existing]]), create);

    await expect(ensureCompendiumPackHandler({ name: 'homebrew-items', label: 'Homebrew Items' })).rejects.toThrow(
      /type "Actor"/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid pack names', async () => {
    setEnv(new Map(), jest.fn());

    await expect(ensureCompendiumPackHandler({ name: 'Homebrew Items', label: 'x' })).rejects.toThrow(/Invalid pack name/);
    await expect(ensureCompendiumPackHandler({ name: '', label: 'x' })).rejects.toThrow(/Invalid pack name/);
    await expect(ensureCompendiumPackHandler({ name: 'with.dot', label: 'x' })).rejects.toThrow(/Invalid pack name/);
  });

  it('rejects empty labels', async () => {
    setEnv(new Map(), jest.fn());

    await expect(ensureCompendiumPackHandler({ name: 'homebrew', label: '   ' })).rejects.toThrow(
      'Pack label cannot be empty',
    );
  });

  it('errors when packs collection is unavailable', async () => {
    setEnv(undefined);

    await expect(ensureCompendiumPackHandler({ name: 'homebrew', label: 'x' })).rejects.toThrow(
      'Foundry packs collection not available',
    );
  });

  it('errors when CompendiumCollection global is unavailable on a fresh-create path', async () => {
    setEnv(new Map());
    delete (globalThis as Record<string, unknown>)['CompendiumCollection'];

    await expect(ensureCompendiumPackHandler({ name: 'homebrew', label: 'x' })).rejects.toThrow(
      'CompendiumCollection global not available',
    );
  });
});
