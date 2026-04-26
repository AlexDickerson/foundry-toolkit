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

  // ─── character().rollSkill ──────────────────────────────────────────────

  describe('character().rollSkill', () => {
    it('dispatches class=CharacterPF2e, method=skills.<slug>.roll', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').rollSkill('acrobatics');

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'skills.acrobatics.roll',
        args: [{}],
      });
    });

    it('interpolates arbitrary skill slugs including lore skills', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').rollSkill('tanning-lore');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ method: 'skills.tanning-lore.roll' }));
    });

    it('passes opts through in args[0]', async () => {
      const { dispatch, spy } = makeDispatch();
      const opts = { skipDialog: true };
      await createPf2eClient(dispatch).character('actor-001').rollSkill('athletics', opts);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [opts] }));
    });

    it('defaults opts to {} when omitted', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('actor-001').rollSkill('stealth');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [{}] }));
    });

    it('uses the actorId supplied to character()', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).character('specific-actor').rollSkill('arcana');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'specific-actor' }));
    });

    it('returns the DispatchResponse from the dispatch function', async () => {
      const { dispatch } = makeDispatch();
      const expected: DispatchResponse = { result: { total: 14, formula: '1d20+3' } };
      vi.mocked(dispatch).mockResolvedValueOnce(expected);

      const resp = await createPf2eClient(dispatch).character('actor-001').rollSkill('deception');
      expect(resp).toEqual(expected);
    });
  });

  // ─── weapon().rollAttack ─────────────────────────────────────────────────

  describe('weapon().rollAttack', () => {
    it('dispatches with the variants[N] numeric-index convention', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollAttack(0);

      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'system.actions[@slug:longsword].variants[0].roll',
        args: [{ skipDialog: true }],
      });
    });

    it('encodes variantIndex 1 (MAP -5) in the method path', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollAttack(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'system.actions[@slug:longsword].variants[1].roll' }),
      );
    });

    it('encodes variantIndex 2 (MAP -10) in the method path', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollAttack(2);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'system.actions[@slug:longsword].variants[2].roll' }),
      );
    });

    it('always includes skipDialog: true in args', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollAttack(0);
      const req = (spy.mock.calls[0] as [{ args: unknown[] }])[0];
      expect((req.args[0] as Record<string, unknown>)['skipDialog']).toBe(true);
    });

    it('merges additional opts while preserving skipDialog', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollAttack(0, { rollMode: 'gmroll' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [{ skipDialog: true, rollMode: 'gmroll' }] }));
    });

    it('interpolates arbitrary slugs into the method path', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'my-battle-axe').rollAttack(0);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'system.actions[@slug:my-battle-axe].variants[0].roll' }),
      );
    });
  });

  // ─── weapon().rollDamage ─────────────────────────────────────────────────

  describe('weapon().rollDamage', () => {
    it('dispatches to .damage() for normal rolls (critical=false default)', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollDamage();

      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'system.actions[@slug:longsword].damage',
        args: [{}],
      });
    });

    it('dispatches to .critical() for critical rolls (critical=true)', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollDamage(true);

      expect(spy).toHaveBeenCalledWith({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'system.actions[@slug:longsword].critical',
        args: [{}],
      });
    });

    it('interpolates arbitrary slugs into the method path', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('actor-001', 'my-battle-axe').rollDamage();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'system.actions[@slug:my-battle-axe].damage' }),
      );
    });

    it('passes opts through in args[0]', async () => {
      const { dispatch, spy } = makeDispatch();
      const opts = { bonus: 2 };
      await createPf2eClient(dispatch).weapon('actor-001', 'longsword').rollDamage(false, opts);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: [opts] }));
    });

    it('uses the actorId supplied to weapon()', async () => {
      const { dispatch, spy } = makeDispatch();
      await createPf2eClient(dispatch).weapon('specific-actor', 'dagger').rollDamage();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'specific-actor' }));
    });
  });
});
