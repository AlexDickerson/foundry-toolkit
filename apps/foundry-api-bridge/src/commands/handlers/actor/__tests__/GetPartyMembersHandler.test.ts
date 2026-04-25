import { getPartyMembersHandler } from '../GetPartyMembersHandler';
import { PARTY_ACTOR_NAME } from '../../../../party-config';

interface MockMember {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  system: Record<string, unknown>;
}

interface MockPartyActor {
  id: string;
  name: string;
  type: string;
  members?: MockMember[] | undefined;
}

function makeMember(overrides?: Partial<MockMember>): MockMember {
  return {
    id: 'char-1',
    name: 'Amiri',
    type: 'character',
    img: 'tokens/amiri.webp',
    system: {
      perception: { mod: 8 },
      attributes: { hp: { value: 45, max: 60 } },
    },
    ...overrides,
  };
}

function makePartyActor(overrides?: Partial<MockPartyActor>): MockPartyActor {
  return {
    id: 'xxxPF2ExPARTYxxx',
    name: PARTY_ACTOR_NAME,
    type: 'party',
    members: [makeMember()],
    ...overrides,
  };
}

function setGame(actors: MockPartyActor[]): void {
  (globalThis as Record<string, unknown>)['game'] = {
    actors: {
      forEach: jest.fn((fn: (a: MockPartyActor) => void) => actors.forEach(fn)),
    },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

describe('PARTY_ACTOR_NAME', () => {
  it('defaults to "The Party"', () => {
    expect(PARTY_ACTOR_NAME).toBe('The Party');
  });
});

describe('getPartyMembersHandler', () => {
  afterEach(() => clearGame());

  it('returns characters from the party actor members', async () => {
    setGame([makePartyActor()]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'char-1', name: 'Amiri', img: 'tokens/amiri.webp' });
  });

  it('extracts perception mod and max HP from PF2e system data', async () => {
    setGame([makePartyActor()]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.initiativeMod).toBe(8);
    expect(member?.maxHp).toBe(60);
  });

  it('falls back to attributes.perception.value when perception.mod is absent', async () => {
    setGame([
      makePartyActor({
        members: [
          makeMember({
            system: { attributes: { perception: { value: 5 }, hp: { max: 40 } } },
          }),
        ],
      }),
    ]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.initiativeMod).toBe(5);
    expect(member?.maxHp).toBe(40);
  });

  it('defaults initiativeMod and maxHp to 0 when system data is missing', async () => {
    setGame([makePartyActor({ members: [makeMember({ system: {} })] })]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.initiativeMod).toBe(0);
    expect(member?.maxHp).toBe(0);
  });

  it('excludes non-character members (e.g. familiars)', async () => {
    setGame([
      makePartyActor({
        members: [makeMember({ type: 'familiar' }), makeMember({ id: 'char-2', type: 'character' })],
      }),
    ]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('char-2');
  });

  it('returns empty array when no party actor matches the name', async () => {
    setGame([makePartyActor({ name: 'Different Party' })]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(0);
  });

  it('returns empty array when the game has no actors', async () => {
    setGame([]);
    const result = await getPartyMembersHandler({});
    expect(result).toEqual([]);
  });

  it('returns empty array when party actor has no members property', async () => {
    setGame([makePartyActor({ members: undefined })]);
    const result = await getPartyMembersHandler({});
    expect(result).toEqual([]);
  });

  it('returns empty array when party actor has an empty members list', async () => {
    setGame([makePartyActor({ members: [] })]);
    const result = await getPartyMembersHandler({});
    expect(result).toEqual([]);
  });

  it('accepts a custom partyName override', async () => {
    setGame([makePartyActor({ name: 'The Fellowship' })]);
    const result = await getPartyMembersHandler({ partyName: 'The Fellowship' });
    expect(result).toHaveLength(1);
  });

  it('ignores non-party actors', async () => {
    setGame([
      { id: 'npc-1', name: 'Goblin', type: 'npc', members: [makeMember()] },
      makePartyActor(),
    ]);
    const result = await getPartyMembersHandler({});
    // Should only read from the party actor, not the npc
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Amiri');
  });

  it('returns multiple characters when the party has several members', async () => {
    setGame([
      makePartyActor({
        members: [
          makeMember({ id: 'c1', name: 'Amiri' }),
          makeMember({ id: 'c2', name: 'Harsk' }),
          makeMember({ id: 'c3', name: 'Merisiel' }),
        ],
      }),
    ]);
    const result = await getPartyMembersHandler({});
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.name)).toEqual(['Amiri', 'Harsk', 'Merisiel']);
  });

  it('falls back img to empty string when member img is undefined', async () => {
    setGame([makePartyActor({ members: [makeMember({ img: undefined })] })]);
    const [member] = await getPartyMembersHandler({});
    expect(member?.img).toBe('');
  });
});
