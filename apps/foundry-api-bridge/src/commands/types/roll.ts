/** Dice-rolling params and results for the generic roll-dice command. */

export interface RollDiceParams {
  formula: string;
  showInChat?: boolean;
  flavor?: string;
}

export interface DiceResult {
  type: string;
  count: number;
  results: number[];
}

export interface RollResult {
  total: number;
  formula: string;
  dice: DiceResult[];
  isCritical?: boolean;
  isFumble?: boolean;
}
