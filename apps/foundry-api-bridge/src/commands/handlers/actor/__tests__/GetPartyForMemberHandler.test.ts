import { getPartyForMemberHandler } from '../GetPartyForMemberHandler';
import { PARTY_ACTOR_NAME } from '../../../../party-config';

// ─── Minimal actor shapes ───────────────────────────────────────────────────

interface MockCondition {
  slug: string;
  system: Record<string, unknown>;
}

interface MockMember {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  system: Record<string, unknown>;
  itemTypes?: { condition?: MockCondition[] };
  parties?: MockPartyActor[];
}

interface MockPartyActor {
  id: string;
  name: string;
  type: string;
  img: string | undefined;
  members?: MockMember[];
}

function makeMember(overrides?: Partial<MockMember>): MockMember {
  return {
    id: 'chr-1',
    name: 'Amiri',
    type: 'character',
    img: 'tokens/amiri.webp',
    system: {
      details: { level: { value: 5 } },
      attributes: {
        hp: { value: 45, max: 60, temp: 0 },
        ac: { value: 18 },
      },
      perception: { mod: 8 },
      resources: { heroPoints: { value: 1, max: 3 } },
    },
    itemTypes: { condition: [] },
    ...overrides,
  };
}

function makePartyActor(overrides?: Partial<MockPartyActor>): MockPartyActor {
  return {
    id: 'party-1',
    name: PARTY_ACTOR_NAME,
    type: 'party',
    img: 'img/party.webp',
    members: [makeMember()],
    ...overrides,
  };
}

// ─── Game mock helpers ──────────────────────────────────────────────────────

function setGame(actors: MockPartyActor[], characterById?: Record<string, MockMember>): void {
  (globalThis as Record<string, unknown>)['game'] = {
    actors: {
      get: jest.fn((id: string) => characterById?.[id]),
      forEach: jest.fn((fn: (a: MockPartyActor) => void) => actors.forEach(fn)),
    },
  };
}

function clearGame(): void {
  delete (globalThis as Record<string, unknown>)['game'];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('getPartyForMemberHandler', () => {
  afterEach(() => clearGame());

  describe('data-driven path (actor.parties)', () => {
    it('resolves the party via actor.parties[0]', async () => {
      const party = makePartyActor({ id: 'p-1', name: 'The Party' });
      const character = makeMember({ id: 'chr-1', parties: [party] });
      setGame([], { 'chr-1': character });

      const result = await getPartyForMemberHandler({ actorId: 'chr-1' });

      expect(result.party).toMatchObject({ id: 'p-1', name: 'The Party' });
      expect(result.members).toHaveLength(1);
      expect(result.members[0]?.id).toBe('chr-1');
    });

    it('marks isOwnedByUser = true for the requesting actor', async () => {
      const member2 = makeMember({ id: 'chr-2', name: 'Harsk' });
      const party = makePartyActor({ members: [makeMember({ id: 'chr-1' }), member2] });
      const character = makeMember({ id: 'chr-1', parties: [party] });
      setGame([], { 'chr-1': character });

      const result = await getPartyForMemberHandler({ actorId: 'chr-1' });

      const amiri = result.members.find((m) => m.id === 'chr-1');
      const harsk = result.members.find((m) => m.id === 'chr-2');
      expect(amiri?.isOwnedByUser).toBe(true);
      expect(harsk?.isOwnedByUser).toBe(false);
    });

    it('returns null party when actor.parties is empty', async () => {
      const character = makeMember({ id: 'chr-1', parties: [] });
      setGame([], { 'chr-1': character });

      const result = await getPartyForMemberHandler({ actorId: 'chr-1' });

      expect(result.party).toBeNull();
      expect(result.members).toEqual([]);
    });
  });

  describe('name-based fallback path', () => {
    it('falls back to name lookup when actor.parties is absent', async () => {
      const party = makePartyActor({ id: 'p-fb', name: PARTY_ACTOR_NAME });
      const character = makeMember({ id: 'chr-1' }); // no .parties property
      setGame([party], { 'chr-1': character });

      const result = await getPartyForMemberHandler({ actorId: 'chr-1' });

      expect(result.party?.name).toBe(PARTY_ACTOR_NAME);
      expect(result.members).toHaveLength(1);
    });

    it('respects a custom partyName override', async () => {
      const party = makePartyActor({ name: 'The Fellowship' });
      const character = makeMember({ id: 'chr-1' });
      setGame([party], { 'chr-1': character });

      const result = await getPartyForMemberHandler({ actorId: 'chr-1', partyName: 'The Fellowship' });

      expect(result.party?.name).toBe('The Fellowship');
    });

    it('returns null party when no party actor matches the name', async () => {
      setGame([makePartyActor({ name: 'Different Party' })], {});

      const result = await getPartyForMemberHandler({ actorId: 'chr-x' });

      expect(result.party).toBeNull();
      expect(result.members).toEqual([]);
    });
  });

  describe('member data extraction', () => {
    it('extracts level, HP, AC, perceptionMod, heroPoints', async () => {
      const party = makePartyActor();
      const character = makeMember({ id: 'chr-1', parties: [party] });
      setGame([], { 'chr-1': character });

      const [member] = (await getPartyForMemberHandler({ actorId: 'chr-1' })).members;

      expect(member?.level).toBe(5);
      expect(member?.hp).toEqual({ value: 45, max: 60, temp: 0 });
      expect(member?.ac).toBe(18);
      expect(member?.perceptionMod).toBe(8);
      expect(member?.heroPoints).toEqual({ value: 1, max: 3 });
    });

    it('falls back to attributes.perception.value for perceptionMod', async () => {
      const member = makeMember({
        id: 'chr-1',
        system: {
          details: { level: { value: 3 } },
          attributes: { hp: { value: 30, max: 40, temp: 0 }, ac: { value: 15 }, perception: { value: 5 } },
          resources: { heroPoints: { value: 0, max: 3 } },
        },
        itemTypes: { condition: [] },
      });
      const party = makePartyActor({ members: [member] });
      setGame([], { 'chr-1': { ...member, parties: [party] } });

      const [m] = (await getPartyForMemberHandler({ actorId: 'chr-1' })).members;
      expect(m?.perceptionMod).toBe(5);
    });

    it('includes a shield when shieldHpMax > 0', async () => {
      const member = makeMember({
        id: 'chr-1',
        system: {
          details: { level: { value: 4 } },
          attributes: {
            hp: { value: 50, max: 60, temp: 0 },
            ac: { value: 20 },
            shield: { hp: { value: 14, max: 20 }, raised: true, broken: false },
          },
          perception: { mod: 7 },
          resources: { heroPoints: { value: 0, max: 3 } },
        },
        itemTypes: { condition: [] },
      });
      const party = makePartyActor({ members: [member] });
      setGame([], { 'chr-1': { ...member, parties: [party] } });

      const [m] = (await getPartyForMemberHandler({ actorId: 'chr-1' })).members;
      expect(m?.shield).toEqual({ hpValue: 14, hpMax: 20, raised: true, broken: false });
    });

    it('returns null shield when shieldHpMax is 0', async () => {
      const member = makeMember({
        id: 'chr-1',
        system: {
          details: { level: { value: 4 } },
          attributes: {
            hp: { value: 50, max: 60, temp: 0 },
            ac: { value: 20 },
            shield: { hp: { value: 0, max: 0 }, raised: false, broken: false },
          },
          perception: { mod: 7 },
          resources: { heroPoints: { value: 0, max: 3 } },
        },
        itemTypes: { condition: [] },
      });
      const party = makePartyActor({ members: [member] });
      setGame([], { 'chr-1': { ...member, parties: [party] } });

      const [m] = (await getPartyForMemberHandler({ actorId: 'chr-1' })).members;
      expect(m?.shield).toBeNull();
    });

    it('extracts conditions with degree values', async () => {
      const member = makeMember({
        id: 'chr-1',
        itemTypes: {
          condition: [
            { slug: 'frightened', system: { value: { value: 2 } } },
            { slug: 'off-guard', system: { value: { value: null } } },
            { slug: 'sickened', system: { value: {} } },
          ],
        },
      });
      const party = makePartyActor({ members: [member] });
      setGame([], { 'chr-1': { ...member, parties: [party] } });

      const [m] = (await getPartyForMemberHandler({ actorId: 'chr-1' })).members;
      expect(m?.conditions).toEqual([
        { slug: 'frightened', value: 2 },
        { slug: 'off-guard', value: null },
        { slug: 'sickened', value: null },
      ]);
    });

    it('returns empty conditions when itemTypes.condition is absent', async () => {
      const member = makeMember({ id: 'chr-1', itemTypes: undefined });
      const party = makePartyActor({ members: [member] });
      setGame([], { 'chr-1': { ...member, parties: [party] } });

      const [m] = (await getPartyForMemberHandler({ actorId: 'chr-1' })).members;
      expect(m?.conditions).toEqual([]);
    });

    it('excludes non-character members (familiars, etc.)', async () => {
      const familiar = makeMember({ id: 'fam-1', type: 'familiar' });
      const character = makeMember({ id: 'chr-2', type: 'character' });
      const party = makePartyActor({ members: [familiar, character] });
      setGame([], { 'chr-2': { ...character, parties: [party] } });

      const result = await getPartyForMemberHandler({ actorId: 'chr-2' });
      expect(result.members).toHaveLength(1);
      expect(result.members[0]?.id).toBe('chr-2');
    });

    it('falls back img to empty string when undefined', async () => {
      const member = makeMember({ id: 'chr-1', img: undefined });
      const party = makePartyActor({ members: [member], img: undefined });
      setGame([], { 'chr-1': { ...member, parties: [party] } });

      const result = await getPartyForMemberHandler({ actorId: 'chr-1' });
      expect(result.party?.img).toBe('');
      expect(result.members[0]?.img).toBe('');
    });
  });
});
