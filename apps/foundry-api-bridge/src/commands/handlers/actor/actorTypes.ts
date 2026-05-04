import type { DiceResult } from '@/commands/types';
import type { FoundryDiceTerm } from '../../../types/foundry-event-shapes.js';

export function extractDiceResults(terms: FoundryDiceTerm[]): DiceResult[] {
  const diceResults: DiceResult[] = [];

  for (const term of terms) {
    if (term.faces !== undefined && term.results !== undefined) {
      diceResults.push({
        type: `d${String(term.faces)}`,
        count: term.number ?? 1,
        results: term.results.map((r) => r.result),
      });
    }
  }

  return diceResults;
}
