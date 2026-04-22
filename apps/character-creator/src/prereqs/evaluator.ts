import type { CharacterContext, Evaluation, Predicate } from './types';

// Evaluates a single predicate against the character context. Returns
// `unknown` for cases we intentionally don't enforce yet (unsupported
// patterns, feat-name lookups, etc.) so the filter UI can still let the
// match through.
export function evaluatePredicate(pred: Predicate, ctx: CharacterContext): Evaluation {
  switch (pred.kind) {
    case 'skill-rank': {
      const rank = ctx.skillRanks.get(pred.skill.toLowerCase());
      if (rank === undefined) return 'unknown';
      return rank >= pred.min ? 'meets' : 'fails';
    }
    case 'level':
      return ctx.level >= pred.min ? 'meets' : 'fails';
    case 'ability': {
      // pf2e prereqs quote raw ability *scores* (e.g. "Strength 14").
      // The prepared payload only gives us mods; a +2 mod maps to a
      // score of 14 under 2e's mod = floor((score-10)/2) math. Close
      // enough for threshold checks — score = 10 + 2*mod.
      const mod = ctx.abilityMods[pred.ability];
      const score = 10 + 2 * mod;
      return score >= pred.min ? 'meets' : 'fails';
    }
    case 'ancestry': {
      if (ctx.ancestryTrait === undefined) return 'unknown';
      return ctx.ancestryTrait.toLowerCase() === pred.slug.toLowerCase() ? 'meets' : 'fails';
    }
    case 'class': {
      if (ctx.classTrait === undefined) return 'unknown';
      return ctx.classTrait.toLowerCase() === pred.slug.toLowerCase() ? 'meets' : 'fails';
    }
    case 'feat':
      return ctx.features.has(pred.name.toLowerCase()) ? 'meets' : 'fails';
    case 'unsupported':
      return 'unknown';
  }
}

// Combines a list of predicates with AND semantics. `fails` short-
// circuits to `fails` (one failure sinks the whole requirement);
// `unknown` survives as `unknown` unless another predicate fails.
export function evaluateAll(preds: Predicate[], ctx: CharacterContext): Evaluation {
  let result: Evaluation = 'meets';
  for (const p of preds) {
    const e = evaluatePredicate(p, ctx);
    if (e === 'fails') return 'fails';
    if (e === 'unknown') result = 'unknown';
  }
  return result;
}
