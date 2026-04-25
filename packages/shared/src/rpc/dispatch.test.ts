import { describe, expect, it } from 'vitest';
import {
  dispatchRequestSchema,
  dispatchResponseSchema,
  docRefSchema,
  type DispatchRequest,
  type DispatchResponse,
  type DocRef,
} from './dispatch';

describe('dispatch wire types', () => {
  // ─── docRefSchema ──────────────────────────────────────────────────────────

  describe('docRefSchema', () => {
    it('parses a valid DocRef', () => {
      const ref: DocRef = docRefSchema.parse({ __doc: 'Actor', id: 'abc123' });
      expect(ref.__doc).toBe('Actor');
      expect(ref.id).toBe('abc123');
    });

    it('rejects a DocRef with an empty __doc', () => {
      expect(() => docRefSchema.parse({ __doc: '', id: 'abc' })).toThrow();
    });

    it('rejects a DocRef with a missing id field', () => {
      expect(() => docRefSchema.parse({ __doc: 'Actor' })).toThrow();
    });
  });

  // ─── dispatchRequestSchema ─────────────────────────────────────────────────

  describe('dispatchRequestSchema', () => {
    it('round-trips a minimal request (no args supplied)', () => {
      const input = { class: 'CharacterPF2e', id: 'actor-001', method: 'saves.fortitude.roll' };
      const parsed: DispatchRequest = dispatchRequestSchema.parse(input);
      expect(parsed.class).toBe('CharacterPF2e');
      expect(parsed.id).toBe('actor-001');
      expect(parsed.method).toBe('saves.fortitude.roll');
      expect(parsed.args).toEqual([]);
    });

    it('defaults args to [] when omitted', () => {
      const parsed = dispatchRequestSchema.parse({ class: 'Actor', id: 'x', method: 'applyDamage' });
      expect(parsed.args).toEqual([]);
    });

    it('round-trips a request with explicit args', () => {
      const input: DispatchRequest = {
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'applyDamage',
        args: [10, { multiplier: 0.5 }],
      };
      const parsed = dispatchRequestSchema.parse(input);
      expect(parsed.args).toEqual([10, { multiplier: 0.5 }]);
    });

    it('accepts args containing DocRef objects', () => {
      const parsed = dispatchRequestSchema.parse({
        class: 'Actor',
        id: 'abc',
        method: 'someMethod',
        args: [{ __doc: 'Item', id: 'item-1' }, 42, 'hello'],
      });
      expect(parsed.args).toHaveLength(3);
      expect(parsed.args[0]).toEqual({ __doc: 'Item', id: 'item-1' });
    });

    it('accepts array-lookup method paths', () => {
      const parsed = dispatchRequestSchema.parse({
        class: 'CharacterPF2e',
        id: 'actor-001',
        method: 'system.actions[@slug:my-sword].rollDamage',
        args: [{}],
      });
      expect(parsed.method).toBe('system.actions[@slug:my-sword].rollDamage');
    });

    it('rejects an empty class', () => {
      expect(() => dispatchRequestSchema.parse({ class: '', id: 'abc', method: 'foo' })).toThrow();
    });

    it('rejects an empty method', () => {
      expect(() => dispatchRequestSchema.parse({ class: 'Actor', id: 'abc', method: '' })).toThrow();
    });

    it('round-trips via JSON serialization', () => {
      const req: DispatchRequest = {
        class: 'CharacterPF2e',
        id: 'x1',
        method: 'applyDamage',
        args: [10, { multiplier: 1 }],
      };
      const round = dispatchRequestSchema.parse(JSON.parse(JSON.stringify(req)));
      expect(round).toEqual(req);
    });
  });

  // ─── dispatchResponseSchema ────────────────────────────────────────────────

  describe('dispatchResponseSchema', () => {
    it('parses a null result (void / undefined method return)', () => {
      const resp: DispatchResponse = dispatchResponseSchema.parse({ result: null });
      expect(resp.result).toBeNull();
    });

    it('parses a numeric result', () => {
      const resp = dispatchResponseSchema.parse({ result: 42 });
      expect(resp.result).toBe(42);
    });

    it('parses an object result (serialized Document)', () => {
      const resp = dispatchResponseSchema.parse({
        result: { id: 'abc', name: 'Test Actor', type: 'character' },
      });
      expect((resp.result as Record<string, unknown>)['name']).toBe('Test Actor');
    });

    it('round-trips a roll result shape', () => {
      const raw = { result: { total: 17, formula: '1d20+5', dice: [] } };
      const parsed = dispatchResponseSchema.parse(raw);
      expect(parsed).toEqual(raw);
    });

    it('round-trips via JSON serialization', () => {
      const resp: DispatchResponse = { result: { ok: true, data: [1, 2, 3] } };
      const round = dispatchResponseSchema.parse(JSON.parse(JSON.stringify(resp)));
      expect(round).toEqual(resp);
    });
  });
});
