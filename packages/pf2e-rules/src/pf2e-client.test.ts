import { describe, expect, it, vi } from 'vitest';
import { createPf2eClient, type DispatchFn, type DispatchResponse } from './pf2e-client';

// Helper: create a dispatch spy that resolves to { result: null } by default.
function makeDispatch(): { dispatch: DispatchFn; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn().mockResolvedValue({ result: null });
  return { dispatch: spy as DispatchFn, spy };
}

describe('createPf2eClient', () => {
  // ─── character().rollSave ────────────────────────────────────────────────

  describe('character().rollSave', () => {
    it('dispatches class=CharacterPF2e, method=saves.fortitude.roll', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').rollSave('fortitude');

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'saves.fortitude.roll',
        args: [{}],
      });
    });

    it('dispatches saves.reflex.roll for type=reflex', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-002').rollSave('reflex');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'saves.reflex.roll', id: 'actor-002' }));
    });

    it('dispatches saves.will.roll for type=will', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-003').rollSave('will');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'saves.will.roll' }));
    });

    it('passes opts through in args[0]', async () => {
      const { dispatch, spy } = makeDispatch();
      const opts = { skipDialog: true, rollMode: 'gmroll' as const };
      await createPf2eClient(dispatch).character('actor-001').rollSave('fortitude', opts);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [opts] }));
    });

    it('defaults opts to {} when omitted', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').rollSave('fortitude');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [{}] }));
    });

    it('returns the DispatchResponse from the dispatch function', async () => {
      const { dispatch } = makeDispatch();
      const expected: DispatchResponse = { result: { total: 17, formula: '1d20+6' } };
      vi.mocked(dispatch).mockResolvedValueOnce(expected);

      const resp = await createPf2eClient(dispatch).character('actor-001').rollSave('fortitude');
      expect(resp).toEqual(expected);
    });
  });

  // ─── character().applyDamage ─────────────────────────────────────────────

  describe('character().applyDamage', () => {
    it('dispatches method=applyDamage with amount as args[0]', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').applyDamage(12);

      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'applyDamage',
        args: [12, {}],
      });
    });

    it('passes opts through in args[1]', async () => {
      const { dispatch, spy } = makeDispatch();
      const opts = { multiplier: 0.5 };
      await createPf2eClient(dispatch).character('actor-001').applyDamage(8, opts);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [8, opts] }));
    });

    it('defaults opts to {} when omitted', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').applyDamage(5);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [5, {}] }));
    });
  });

  // ─── weapon().rollDamage ─────────────────────────────────────────────────

  describe('weapon().rollDamage', () => {
    it('dispatches with the @slug array-lookup convention', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollDamage();

      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'system.actions[@slug:longsword].rollDamage',
        args: [{}],
      });
    });

    it('interpolates arbitrary strike slugs into the method path', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'my-battle-axe').rollDamage();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'system.actions[@slug:my-battle-axe].rollDamage' }),
      );
    });

    it('passes opts through in args[0]', async () => {
      const { dispatch, spy } = makeDispatch();
      const opts = { critical: true };
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollDamage(opts);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [opts] }));
    });

    it('defaults opts to {} when omitted', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollDamage();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [{}] }));
    });

    it('uses the actorId supplied to weapon(), not character()', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('specific-actor', 'dagger').rollDamage();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'specific-actor' }));
    });
  });
});
