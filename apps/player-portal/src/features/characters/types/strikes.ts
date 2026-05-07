export interface StrikeVariant {
  label: string; // e.g. "+7", "+3 (MAP -4)", "-1 (MAP -8)"
}

export interface StrikeTrait {
  name: string;
  label: string;
  description?: string;
}

export interface StrikeItemSource {
  _id: string;
  img: string;
  name: string;
  type: string;
  system: {
    damage?: { dice: number; die: string; damageType: string };
    range?: number | null;
    traits?: { value: string[]; rarity: string };
    runes?: { potency: number; striking: number; property: string[] };
    bonusDamage?: { value: number };
  };
}

export interface Strike {
  slug: string;
  label: string;
  totalModifier: number;
  quantity: number;
  ready: boolean;
  visible: boolean;
  glyph: string;
  type: string; // usually 'strike'
  item: StrikeItemSource;
  description?: string;
  options?: string[];
  traits: StrikeTrait[];
  weaponTraits: StrikeTrait[];
  variants: StrikeVariant[];
  canAttack: boolean;
  domains?: string[];
}
