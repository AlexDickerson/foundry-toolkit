export type ProficiencyRank = 0 | 1 | 2 | 3 | 4;

export type ModifierKind = 'modifier' | 'bonus' | 'penalty';

export interface Modifier {
  slug: string;
  label: string;
  modifier: number;
  type: string;
  enabled: boolean;
  ignored: boolean;
  kind: ModifierKind;
  hideIfDisabled?: boolean;
}

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITY_KEYS: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
