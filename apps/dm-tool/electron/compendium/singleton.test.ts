// Singleton-level coverage for the monster-pack resolver and the
// available-packs intersection. We mock @foundry-toolkit/db/pf2e's
// settings getters/setters with an in-memory Map so the tests don't
// touch a real pf2e.db, and we drive `refreshAvailableActorPacks` by
// calling init() with a fake `CompendiumApi`.
//
// `readMonsterPackIds()` is the one hot path every monster-facing
// accessor routes through, so the branches covered here map 1:1 to
// the filter behavior every caller sees at runtime.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsStore = new Map<string, string>();

vi.mock('@foundry-toolkit/db/pf2e', () => ({
  getSetting: vi.fn((key: string) => settingsStore.get(key) ?? null),
  setSetting: vi.fn((key: string, value: string) => {
    settingsStore.set(key, value);
  }),
  deleteSetting: vi.fn((key: string) => {
    settingsStore.delete(key);
  }),
}));

// Stub out facets-index so `writeMonsterPackIds` doesn't blow up trying
// to invalidate a real module cache.
vi.mock('./facets-index.js', () => ({
  resetFacetsIndex: vi.fn(),
}));

// Stub `createCompendiumApi` so init can complete without hitting the
// real HTTP stack. The listCompendiumPacks mock drives the
// available-packs fetch; default is an empty list so each test can
// override with its own pack fixture.
const listCompendiumPacks = vi.fn().mockResolvedValue({ packs: [] });
vi.mock('./index.js', () => ({
  createCompendiumApi: () => ({
    searchCompendium: vi.fn(),
    getCompendiumDocument: vi.fn(),
    listCompendiumPacks,
    listCompendiumSources: vi.fn(),
    ensureCompendiumPack: vi.fn(),
    createCompendiumItem: vi.fn(),
    invalidateDocument: vi.fn(),
    invalidateAllDocuments: vi.fn(),
  }),
}));

// Imports come after mocks so the mocks take effect.
const {
  DEFAULT_MONSTER_PACK_IDS_EXPORT,
  MONSTER_PACK_IDS_SETTING,
  getAvailableActorPacks,
  initPreparedCompendium,
  readMonsterPackIds,
  refreshAvailableActorPacks,
  resetAvailableActorPacks,
  resetPreparedCompendium,
  writeMonsterPackIds,
} = await (async () => {
  const singleton = await import('./singleton');
  const prepared = await import('./prepared');
  return { ...singleton, DEFAULT_MONSTER_PACK_IDS_EXPORT: prepared.DEFAULT_MONSTER_PACK_IDS };
})();

beforeEach(() => {
  settingsStore.clear();
  listCompendiumPacks.mockReset().mockResolvedValue({ packs: [] });
  resetAvailableActorPacks();
  resetPreparedCompendium();
});

afterEach(() => {
  resetPreparedCompendium();
});

describe('readMonsterPackIds — without available-packs cache', () => {
  it('returns defaults when no setting is persisted', () => {
    expect(readMonsterPackIds()).toEqual(DEFAULT_MONSTER_PACK_IDS_EXPORT);
  });

  it('returns the saved list verbatim when the cache is null', () => {
    writeMonsterPackIds(['pf2e.a', 'pf2e.b']);
    expect(readMonsterPackIds()).toEqual(['pf2e.a', 'pf2e.b']);
  });

  it('treats an empty saved list as "reset to defaults"', () => {
    writeMonsterPackIds([]);
    expect(readMonsterPackIds()).toEqual(DEFAULT_MONSTER_PACK_IDS_EXPORT);
  });

  it('falls back to defaults on malformed JSON', () => {
    settingsStore.set(MONSTER_PACK_IDS_SETTING, '{not json at all');
    expect(readMonsterPackIds()).toEqual(DEFAULT_MONSTER_PACK_IDS_EXPORT);
  });
});

describe('readMonsterPackIds — intersection against available packs', () => {
  it('strips packs not installed in Foundry', async () => {
    listCompendiumPacks.mockResolvedValue({
      packs: [{ id: 'pf2e.a', label: 'A', type: 'Actor' }],
    });
    initPreparedCompendium({ foundryMcpUrl: 'http://localhost:8765' });
    await refreshAvailableActorPacks();

    writeMonsterPackIds(['pf2e.a', 'pf2e.missing', 'pf2e.also-missing']);
    expect(readMonsterPackIds()).toEqual(['pf2e.a']);
  });

  it('falls back to defaults ∩ available when no saved pack is installed', async () => {
    const [firstDefault] = DEFAULT_MONSTER_PACK_IDS_EXPORT;
    listCompendiumPacks.mockResolvedValue({
      packs: [{ id: firstDefault, label: 'Default', type: 'Actor' }],
    });
    initPreparedCompendium({ foundryMcpUrl: 'http://localhost:8765' });
    await refreshAvailableActorPacks();

    writeMonsterPackIds(['pf2e.nonexistent-only']);
    expect(readMonsterPackIds()).toEqual([firstDefault]);
  });

  it('falls through to the raw saved list when neither saved nor defaults overlap', async () => {
    listCompendiumPacks.mockResolvedValue({
      packs: [{ id: 'something-else', label: 'Else', type: 'Actor' }],
    });
    initPreparedCompendium({ foundryMcpUrl: 'http://localhost:8765' });
    await refreshAvailableActorPacks();

    writeMonsterPackIds(['pf2e.a', 'pf2e.b']);
    // No overlap with available or defaults — caller gets the raw
    // saved list and the bridge decides what to do with it.
    expect(readMonsterPackIds()).toEqual(['pf2e.a', 'pf2e.b']);
  });
});

describe('refreshAvailableActorPacks', () => {
  it('populates the cache from the api response', async () => {
    listCompendiumPacks.mockResolvedValue({
      packs: [
        { id: 'pf2e.a', label: 'A', type: 'Actor' },
        { id: 'pf2e.b', label: 'B', type: 'Actor' },
      ],
    });
    initPreparedCompendium({ foundryMcpUrl: 'http://localhost:8765' });
    await refreshAvailableActorPacks();

    const cache = getAvailableActorPacks();
    expect(cache).not.toBeNull();
    expect(cache?.has('pf2e.a')).toBe(true);
    expect(cache?.has('pf2e.b')).toBe(true);
    expect(cache?.has('pf2e.c')).toBe(false);
  });

  it('is a no-op when init was never called', async () => {
    await refreshAvailableActorPacks();
    expect(getAvailableActorPacks()).toBeNull();
  });

  it('leaves the cache intact on api failure', async () => {
    // Prime with a successful fetch so the cache has content.
    listCompendiumPacks.mockResolvedValue({
      packs: [{ id: 'pf2e.a', label: 'A', type: 'Actor' }],
    });
    initPreparedCompendium({ foundryMcpUrl: 'http://localhost:8765' });
    await refreshAvailableActorPacks();
    expect(getAvailableActorPacks()?.has('pf2e.a')).toBe(true);

    // Swap to a failing mock and refresh again — the error is logged,
    // the cache is kept as-is.
    listCompendiumPacks.mockRejectedValueOnce(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await refreshAvailableActorPacks();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not list'), expect.any(String));
    warn.mockRestore();

    expect(getAvailableActorPacks()?.has('pf2e.a')).toBe(true);
  });
});
