import { describe, expect, it } from 'vitest';
import { buildCastSpellParams } from './spell-cast';

describe('buildCastSpellParams', () => {
  // ─── Spontaneous ─────────────────────────────────────────────────────────

  describe('spontaneous', () => {
    it('uses baseRank when castAtRank is absent', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-1',
        spellId: 'spell-1',
        baseRank: 3,
        mode: 'spontaneous',
      });
      expect(result).toEqual({ entryId: 'entry-1', spellId: 'spell-1', rank: 3 });
    });

    it('uses castAtRank to heighten', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-1',
        spellId: 'spell-1',
        baseRank: 2,
        mode: 'spontaneous',
        castAtRank: 5,
      });
      expect(result).toEqual({ entryId: 'entry-1', spellId: 'spell-1', rank: 5 });
    });

    it('ignores castAtRank for cantrips (baseRank=0)', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-1',
        spellId: 'cantrip-1',
        baseRank: 0,
        mode: 'spontaneous',
        castAtRank: 7,
      });
      expect(result).toEqual({ entryId: 'entry-1', spellId: 'cantrip-1', rank: 0 });
    });
  });

  // ─── Prepared ────────────────────────────────────────────────────────────

  describe('prepared', () => {
    it('uses baseRank for prepared spells (slot rank determines which slot)', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-2',
        spellId: 'spell-2',
        baseRank: 4,
        mode: 'prepared',
      });
      expect(result).toEqual({ entryId: 'entry-2', spellId: 'spell-2', rank: 4 });
    });

    it('prepared spells can be heightened via castAtRank', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-2',
        spellId: 'spell-2',
        baseRank: 1,
        mode: 'prepared',
        castAtRank: 3,
      });
      expect(result).toEqual({ entryId: 'entry-2', spellId: 'spell-2', rank: 3 });
    });
  });

  // ─── Focus ───────────────────────────────────────────────────────────────

  describe('focus', () => {
    it('always uses baseRank regardless of castAtRank', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-3',
        spellId: 'spell-3',
        baseRank: 3,
        mode: 'focus',
        castAtRank: 7,
      });
      expect(result).toEqual({ entryId: 'entry-3', spellId: 'spell-3', rank: 3 });
    });

    it('returns baseRank when castAtRank is absent', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-3',
        spellId: 'spell-3',
        baseRank: 2,
        mode: 'focus',
      });
      expect(result).toEqual({ entryId: 'entry-3', spellId: 'spell-3', rank: 2 });
    });
  });

  // ─── Innate ──────────────────────────────────────────────────────────────

  describe('innate', () => {
    it('always uses baseRank (innate spells are fixed-rank)', () => {
      const result = buildCastSpellParams({
        entryId: 'entry-4',
        spellId: 'spell-4',
        baseRank: 1,
        mode: 'innate',
        castAtRank: 9,
      });
      expect(result).toEqual({ entryId: 'entry-4', spellId: 'spell-4', rank: 1 });
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  it('passes entryId and spellId through unchanged', () => {
    const result = buildCastSpellParams({
      entryId: 'my-entry-uuid',
      spellId: 'my-spell-uuid',
      baseRank: 1,
      mode: 'spontaneous',
    });
    expect(result.entryId).toBe('my-entry-uuid');
    expect(result.spellId).toBe('my-spell-uuid');
  });
});
