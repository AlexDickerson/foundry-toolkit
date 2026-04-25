// Pure helpers for building spell-cast payloads sent to the
// foundry-api-bridge `cast-spell` invoke-actor-action handler.
//
// These functions are dependency-free and fully unit-testable — they
// contain no I/O or Foundry globals.

export type SpellCastPreparationMode = 'prepared' | 'spontaneous' | 'focus' | 'innate' | 'ritual' | 'items';

export interface CastSpellParams {
  entryId: string;
  spellId: string;
  /** Rank to cast at (0 = cantrip). For prepared casters this is the slot
   *  rank; for spontaneous it controls which slot bucket is consumed. */
  rank: number;
}

export interface BuildCastParamsOptions {
  entryId: string;
  spellId: string;
  /** Base rank of the spell. Cantrips pass 0. */
  baseRank: number;
  /** Preparation mode of the entry that owns this spell. */
  mode: SpellCastPreparationMode;
  /** Override: cast the spell at a higher rank than its base (heightening).
   *  Ignored for cantrips and focus spells — they always cast at their
   *  natural rank. Defaults to baseRank when absent. */
  castAtRank?: number;
}

/**
 * Build the params object expected by the `cast-spell` invoke-actor-action.
 *
 * Pure function — no side effects, no I/O.
 *
 * @example
 * // Spontaneous caster with explicit rank
 * buildCastSpellParams({ entryId: 'e1', spellId: 's1', baseRank: 3, mode: 'spontaneous', castAtRank: 5 })
 * // → { entryId: 'e1', spellId: 's1', rank: 5 }
 *
 * @example
 * // Prepared spell
 * buildCastSpellParams({ entryId: 'e2', spellId: 's2', baseRank: 2, mode: 'prepared' })
 * // → { entryId: 'e2', spellId: 's2', rank: 2 }
 *
 * @example
 * // Focus spell
 * buildCastSpellParams({ entryId: 'e3', spellId: 's3', baseRank: 3, mode: 'focus', castAtRank: 5 })
 * // → { entryId: 'e3', spellId: 's3', rank: 3 }  (castAtRank ignored)
 */
export function buildCastSpellParams(opts: BuildCastParamsOptions): CastSpellParams {
  const { entryId, spellId, baseRank, mode, castAtRank } = opts;

  // Focus and innate spells are cast at their natural rank; heightening
  // is handled by PF2e automatically for cantrips.
  const isCantrip = baseRank === 0;
  const fixedRank = isCantrip || mode === 'focus' || mode === 'innate';
  const rank = fixedRank ? baseRank : (castAtRank ?? baseRank);

  return { entryId, spellId, rank };
}
