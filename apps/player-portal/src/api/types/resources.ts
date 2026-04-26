export interface Ability {
  mod: number;
  base: number;
  label: string; // i18n key, e.g. "PF2E.AbilityStr"
  shortLabel: string; // i18n key, e.g. "PF2E.AbilityId.str"
}

export interface HPAttribute {
  value: number;
  max: number;
  temp: number;
  totalModifier: number;
  breakdown: string;
}

export interface ACAttribute {
  value: number;
  totalModifier: number;
  dc: number;
  breakdown: string;
  attribute: string;
}

export interface HeroPoints {
  value: number;
  max: number;
}

export interface PointPool {
  value: number;
  max: number;
}

export interface FocusPool {
  value: number;
  max: number;
  cap: number;
}

export interface Dying {
  value: number;
  max: number;
  recoveryDC: number;
}

export interface Wounded {
  value: number;
  max: number;
}

export interface Doomed {
  value: number;
  max: number;
}
