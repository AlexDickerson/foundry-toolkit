import type { FoundryActor, Pf2eStrike } from './types';

export function readNumber(root: Record<string, unknown>, path: readonly string[]): number {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return 0;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : 0;
}

export function resolveStrike(actor: FoundryActor, slug: string): Pf2eStrike {
  const actions = actor.system.actions;
  if (!Array.isArray(actions)) {
    throw new Error(`actor ${actor.id} has no system.actions — is this a pf2e character?`);
  }
  const strike = actions.find((s) => s.slug === slug);
  if (!strike) {
    throw new Error(`strike "${slug}" not found on actor ${actor.id}`);
  }
  return strike;
}

export interface CraftingFormulaEntry {
  uuid: string;
}

export function readFormulas(actor: FoundryActor): CraftingFormulaEntry[] {
  const crafting = (actor.system as { crafting?: { formulas?: unknown } }).crafting;
  const formulas = crafting?.formulas;
  if (!Array.isArray(formulas)) return [];
  return formulas.filter((f): f is CraftingFormulaEntry => {
    return typeof f === 'object' && f !== null && typeof (f as { uuid?: unknown }).uuid === 'string';
  });
}
