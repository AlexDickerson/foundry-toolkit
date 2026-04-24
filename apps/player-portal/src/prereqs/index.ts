export { fromPreparedCharacter } from './character-context';
export { parsePrerequisite } from './parser';
export { evaluateAll, evaluatePredicate } from './evaluator';
export type { CharacterContext, Evaluation, Predicate } from './types';

import type { CompendiumDocument } from '../api/types';
import { parsePrerequisite } from './parser';
import { evaluateAll } from './evaluator';
import type { CharacterContext, Evaluation } from './types';

// Convenience: run the full pipeline over a document's prerequisites.
// Returns `unknown` if the document has no prerequisite data at all,
// since "no requirement" is trivially met but we treat unseen data as
// "we don't know yet" to stay safe for UX.
export function evaluateDocument(doc: CompendiumDocument, ctx: CharacterContext): Evaluation {
  const sys = doc.system as {
    prerequisites?: { value?: unknown; predicate?: unknown };
  };
  const rawEntries = sys.prerequisites?.value;
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return 'meets';

  const texts: string[] = [];
  for (const entry of rawEntries) {
    if (typeof entry === 'string') texts.push(entry);
    else if (entry && typeof entry === 'object') {
      const value = (entry as { value?: unknown }).value;
      if (typeof value === 'string') texts.push(value);
    }
  }
  if (texts.length === 0) return 'meets';

  const preds = texts.flatMap((t) => parsePrerequisite(t));
  return evaluateAll(preds, ctx);
}
