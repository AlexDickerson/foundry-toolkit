import type { CharacterContext, Evaluation, Predicate } from './types';

// True when the normalised skill key follows the lore pattern ("<topic> lore").
// Used to distinguish lore skills from standard ones when looking up absent keys.
const isLoreKey = (s: string): boolean => s.endsWith(' lore');

// Resolves the rank for a skill, treating absent lore skills as rank-0 misses
// when we have definitive lore data (ctx.loreSkillSlugs is a real Set).
// Returns undefined only when rank is genuinely unknown.
function resolveRank(ctx: CharacterContext, skill: string): number | undefined {
  const rank = ctx.skillRanks.get(skill);
  if (rank !== undefined) return rank;
  // Absent lore skill + complete lore data → rank 0 (character doesn't have it)
  if (isLoreKey(skill) && ctx.loreSkillSlugs !== undefined) return 0;
  return undefined;
}

// Evaluates a single predicate against the character context. Returns
// `unknown` for cases we intentionally don't enforce yet (unsupported
// patterns, feat-name lookups, etc.) so the filter UI can still let the
// match through.
export function evaluatePredicate(pred: Predicate, ctx: CharacterContext): Evaluation {
  switch (pred.kind) {
    case 'skill-rank': {
      const rank = resolveRank(ctx, pred.skill.toLowerCase());
      if (rank === undefined) return 'unknown';
      return rank >= pred.min ? 'meets' : 'fails';
    }
    case 'skill-rank-any': {
      if (ctx.skillRanks.size === 0) return 'unknown';
      for (const rank of ctx.skillRanks.values()) {
        if (rank >= pred.min) return 'meets';
      }
      return 'fails';
    }
    case 'skill-rank-any-of': {
      let anyUnknown = false;
      for (const skill of pred.skills) {
        const rank = resolveRank(ctx, skill.toLowerCase());
        if (rank === undefined) { anyUnknown = true; continue; }
        if (rank >= pred.min) return 'meets';
      }
      return anyUnknown ? 'unknown' : 'fails';
    }
    case 'skill-rank-any-of-or-lore': {
      // Passes if any specific skill OR any lore skill reaches the threshold.
      let anyUnknown = false;
      for (const skill of pred.skills) {
        const rank = resolveRank(ctx, skill.toLowerCase());
        if (rank === undefined) { anyUnknown = true; continue; }
        if (rank >= pred.min) return 'meets';
      }
      if (ctx.loreSkillSlugs !== undefined) {
        for (const slug of ctx.loreSkillSlugs) {
          const rank = ctx.skillRanks.get(slug);
          if (rank !== undefined && rank >= pred.min) return 'meets';
        }
      } else {
        anyUnknown = true; // no lore data — can't rule out a qualifying lore skill
      }
      return anyUnknown ? 'unknown' : 'fails';
    }
    case 'skill-rank-any-lore': {
      // Passes if any lore skill the character has reaches the threshold.
      if (ctx.loreSkillSlugs === undefined) return 'unknown';
      for (const slug of ctx.loreSkillSlugs) {
        const rank = ctx.skillRanks.get(slug);
        if (rank !== undefined && rank >= pred.min) return 'meets';
      }
      return 'fails'; // definitive: no lore skill at this rank (or none owned)
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
