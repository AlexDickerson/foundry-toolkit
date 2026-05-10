// PF2e immunities/weaknesses/resistances share a near-identical shape.
// `value` is absent on immunities, present (numeric) on weaknesses/resistances.
export interface IWREntry {
  type: string;
  value?: number;
  exceptions?: string[];
  doubleVs?: string[];
  source?: string;
}

export interface Shield {
  itemId: string | null;
  name: string; // i18n key or literal (e.g. "PF2E.ArmorTypeShield")
  ac: number;
  hp: { value: number; max: number };
  brokenThreshold: number;
  hardness: number;
  raised: boolean;
  broken: boolean;
  destroyed: boolean;
  icon: string;
}

export interface Reach {
  base: number;
  manipulate: number;
}
