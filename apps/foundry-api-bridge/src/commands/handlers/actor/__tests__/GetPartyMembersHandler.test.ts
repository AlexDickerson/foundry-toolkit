import { getPartyMembersHandler } from '../GetPartyMembersHandler';
import { PARTY_FOLDER_NAME } from '../../../../party-config';

interface MockFolder {
  id: string;
  name: string;
}

interface MockActor {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  folder: MockFolder | null;
  system: Record<string, unknown>;
}

function makeActor(overrides?: Partial<MockActor>): MockActor {
  return {
    id: 'actor-1',
    name: 'Amiri',
    type: 'character',
    img: 'tokens/amiri.webp',
    folder: { id: 'folder-1', name: PARTY_FOLDER_NAME },
    system: {
      perception: { mod: 8 },
      attributes: { hp: { value: 45, max: 60 } },
    },
    ...overrides,
  };
}

function setGame(actors: MockActor[]): void {
  (globalThis as Record<string, unknown>)['game'] = {
    actors: {
      forEach: jest.fn((fn: (a: MockActor) => void) => actors.forEach(fn)),
    },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

describe('PARTY_FOLDER_NAME', () => {
  it('defaults to "The Party"', () => {
    expect(PARTY_FOLDER_NAME).toBe('The Party');
  });
});

describe('getPartyMembersHandler', () => {
  afterEach(() => clearGame());

  it('returns characters in the party folder', async () => {
    setGame([makeActor()]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'actor-1', name: 'Amiri', img: 'tokens/amiri.webp' });
  });

  it('extracts perception mod and max HP from PF2e system data', async () => {
    setGame([makeActor()]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.initiativeMod).toBe(8);
    expect(member?.maxHp).toBe(60);
  });

  it('falls back to attributes.perception.value when perception.mod is absent', async () => {
    setGame([
      makeActor({
        system: {
          attributes: { perception: { value: 5 }, hp: { max: 40 } },
        },
      }),
    ]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.initiativeMod).toBe(5);
    expect(member?.maxHp).toBe(40);
  });

  it('defaults initiativeMod and maxHp to 0 when system data is missing', async () => {
    setGame([makeActor({ system: {} })]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.initiativeMod).toBe(0);
    expect(member?.maxHp).toBe(0);
  });

  it('excludes NPC actors even if they are in the party folder', async () => {
    setGame([makeActor({ type: 'npc' })]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(0);
  });

  it('excludes characters in a different folder', async () => {
    setGame([makeActor({ folder: { id: 'f2', name: 'Other Folder' } })]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(0);
  });

  it('excludes characters with no folder', async () => {
    setGame([makeActor({ folder: null })]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(0);
  });

  it('accepts a custom folderName override', async () => {
    setGame([makeActor({ folder: { id: 'f2', name: 'My Party' } })]);
    const result = await getPartyMembersHandler({ folderName: 'My Party' });
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when the game has no actors', async () => {
    setGame([]);
    const result = await getPartyMembersHandler({});
    expect(result).toEqual([]);
  });

  it('returns multiple characters when several are in the party folder', async () => {
    setGame([
      makeActor({ id: 'a1', name: 'Amiri' }),
      makeActor({ id: 'a2', name: 'Harsk' }),
      makeActor({ id: 'a3', name: 'Goblin Boss', type: 'npc' }),
    ]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.name)).toEqual(['Amiri', 'Harsk']);
  });

  it('falls back img to empty string when actor.img is undefined', async () => {
    setGame([makeActor({ img: undefined })]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.img).toBe('');
  });
});
