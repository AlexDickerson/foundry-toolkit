import { dispatchHandler } from '../DispatchHandler';

// ─── Game mock setup ─────────────────────────────────────────────────────────

const rollSaveMock = jest.fn();
const applyDamageMock = jest.fn();
const longswordRollDamageMock = jest.fn();
const shortswordRollDamageMock = jest.fn();

const mockActor = {
  id: 'actor-001',
  name: 'Test Character',
  applyDamage: applyDamageMock,
  saves: {
    fortitude: { roll: rollSaveMock },
    reflex: { roll: jest.fn() },
    will: { roll: jest.fn() },
  },
  system: {
    actions: [
      {
        slug: 'longsword',
        item: { slug: 'longsword', name: 'Longsword' },
        rollDamage: longswordRollDamageMock,
      },
      {
        slug: 'shortsword',
        item: { slug: 'shortsword', name: 'Shortsword' },
        rollDamage: shortswordRollDamageMock,
      },
    ],
  },
};

const mockItem = {
  id: 'item-001',
  name: 'Test Item',
};

const mockGame = {
  actors: { get: jest.fn() },
  items: { get: jest.fn() },
};

(global as Record<string, unknown>)['game'] = mockGame;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('dispatchHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGame.actors.get.mockReturnValue(mockActor);
    mockGame.items.get.mockReturnValue(mockItem);
    rollSaveMock.mockResolvedValue({ total: 18, formula: '1d20+6' });
    applyDamageMock.mockResolvedValue(undefined);
    longswordRollDamageMock.mockResolvedValue({ formula: '2d6+4', total: 10 });
    shortswordRollDamageMock.mockResolvedValue({ formula: '1d6+4', total: 7 });
  });

  // ─── Happy path ────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('resolves the collection, calls the method, and wraps the result', async () => {
      const result = await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'saves.fortitude.roll',
        args: [{ skipDialog: true }],
      });

      expect(mockGame.actors.get).toHaveBeenCalledWith('actor-001');
      expect(rollSaveMock).toHaveBeenCalledWith({ skipDialog: true });
      expect(result).toEqual({ result: { total: 18, formula: '1d20+6' } });
    });

    it('calls a top-level method (no dot traversal)', async () => {
      applyDamageMock.mockResolvedValue(null);
      await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'applyDamage',
        args: [10],
      });
      expect(applyDamageMock).toHaveBeenCalledWith(10);
    });

    it('defaults args to [] when omitted from params', async () => {
      rollSaveMock.mockResolvedValue({ total: 12 });
      await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'saves.fortitude.roll',
      });
      expect(rollSaveMock).toHaveBeenCalledWith();
    });

    it('resolves array elements by slug via [@slug:X] convention', async () => {
      const result = await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'system.actions[@slug:longsword].rollDamage',
        args: [{}],
      });
      expect(longswordRollDamageMock).toHaveBeenCalledWith({});
      expect(shortswordRollDamageMock).not.toHaveBeenCalled();
      expect(result).toEqual({ result: { formula: '2d6+4', total: 10 } });
    });

    it('routes to the Item collection for class=Item', async () => {
      const getNameFn = jest.fn().mockReturnValue('Test Item');
      (mockItem as Record<string, unknown>)['getName'] = getNameFn;

      await dispatchHandler({ class: 'Item', id: 'item-001', method: 'getName' });

      expect(mockGame.items.get).toHaveBeenCalledWith('item-001');
      expect(getNameFn).toHaveBeenCalled();
    });
  });

  // ─── Inbound arg marshaling ────────────────────────────────────────────────

  describe('document arg marshaling (inbound)', () => {
    it('resolves a DocRef arg to the actual document', async () => {
      const methodSpy = jest.fn().mockResolvedValue(null);
      (mockActor as Record<string, unknown>)['methodWithDocArg'] = methodSpy;

      await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'methodWithDocArg',
        args: [{ __doc: 'Item', id: 'item-001' }],
      });

      // The DocRef should be replaced by the actual item object
      expect(methodSpy).toHaveBeenCalledWith(mockItem);
    });

    it('passes non-DocRef args through unchanged', async () => {
      const methodSpy = jest.fn().mockResolvedValue(null);
      (mockActor as Record<string, unknown>)['plainMethod'] = methodSpy;

      await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'plainMethod',
        args: [42, 'hello', { plain: true }],
      });

      expect(methodSpy).toHaveBeenCalledWith(42, 'hello', { plain: true });
    });

    it('warns and passes through a DocRef with an unknown class', async () => {
      const methodSpy = jest.fn().mockResolvedValue(null);
      (mockActor as Record<string, unknown>)['methodWithBadRef'] = methodSpy;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'methodWithBadRef',
        args: [{ __doc: 'UnknownClass', id: 'x' }],
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UnknownClass'));
      // The DocRef object itself is passed through unchanged
      expect(methodSpy).toHaveBeenCalledWith({ __doc: 'UnknownClass', id: 'x' });
      warnSpy.mockRestore();
    });
  });

  // ─── Outbound result marshaling ────────────────────────────────────────────

  describe('document result marshaling (outbound)', () => {
    it('serializes Document results via .toObject()', async () => {
      const serialized = { id: 'x', name: 'Some Actor', serialized: true };
      const docResult = { name: 'Some Actor', toObject: jest.fn().mockReturnValue(serialized) };
      applyDamageMock.mockResolvedValue(docResult);

      const result = await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'applyDamage',
        args: [5],
      });

      expect(docResult.toObject).toHaveBeenCalled();
      expect(result.result).toEqual(serialized);
    });

    it('passes through non-Document results unchanged', async () => {
      rollSaveMock.mockResolvedValue({ total: 20, formula: '1d20+7', isCritical: true });

      const result = await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'saves.fortitude.roll',
        args: [{}],
      });

      expect(result.result).toEqual({ total: 20, formula: '1d20+7', isCritical: true });
    });

    it('returns { result: null } when the method returns undefined', async () => {
      applyDamageMock.mockResolvedValue(undefined);

      const result = await dispatchHandler({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'applyDamage',
        args: [10],
      });

      expect(result.result).toBeNull();
    });
  });

  // ─── Error cases ───────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws with a clear message when the class is not in the resolver', async () => {
      await expect(
        dispatchHandler({ class: 'UnknownClass', id: 'x', method: 'foo' }),
      ).rejects.toThrow(/unsupported class 'UnknownClass'/);
    });

    it('throws when the document is not found', async () => {
      mockGame.actors.get.mockReturnValue(undefined);

      await expect(
        dispatchHandler({ class: 'CharacterPF2e', id: 'missing', method: 'applyDamage' }),
      ).rejects.toThrow(/document not found/);
    });

    it('throws when the method is not a function', async () => {
      await expect(
        dispatchHandler({ class: 'CharacterPF2e', id: 'actor-001', method: 'noSuchMethod' }),
      ).rejects.toThrow(/'noSuchMethod' is not a function/);
    });

    it('throws when a traversal property does not exist', async () => {
      await expect(
        dispatchHandler({ class: 'CharacterPF2e', id: 'actor-001', method: 'badPath.method' }),
      ).rejects.toThrow(/property 'badPath' not found/i);
    });

    it('throws when the [@slug:X] lookup finds no matching element', async () => {
      await expect(
        dispatchHandler({
          class: 'CharacterPF2e',
          id: 'actor-001',
          method: 'system.actions[@slug:ghost-weapon].rollDamage',
        }),
      ).rejects.toThrow(/no element with slug 'ghost-weapon'/i);
    });

    it('propagates Foundry method errors without swallowing', async () => {
      rollSaveMock.mockRejectedValue(new Error('Foundry internal error'));

      await expect(
        dispatchHandler({
          class: 'CharacterPF2e',
          id: 'actor-001',
          method: 'saves.fortitude.roll',
        }),
      ).rejects.toThrow('Foundry internal error');
    });

    it('throws when [@slug:X] is applied to a non-array property', async () => {
      await expect(
        dispatchHandler({
          class: 'CharacterPF2e',
          id: 'actor-001',
          // 'saves' is an object, not an array
          method: 'saves[@slug:fortitude].roll',
        }),
      ).rejects.toThrow(/not an array/i);
    });
  });
});
