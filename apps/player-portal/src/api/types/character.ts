import type { AbilityKey } from './primitives';
import type { Ability, ACAttribute, Doomed, Dying, FocusPool, HeroPoints, HPAttribute, PointPool, Wounded } from './resources';
import type { ClassDC, Initiative, MartialProficiency, Perception, Save, SkillStatistic, SpellcastingProficiency } from './stats';
import type { IWREntry, Reach, Shield } from './defenses';
import type { CharacterBiography, DemographicField } from './biography';
import type { Movement } from './movement';
import type { CraftingField } from './crafting';
import type { Strike } from './strikes';

export interface CharacterTraits {
  value: string[]; // trait slugs like "human", "humanoid"
  rarity: string;
  size: { value: string; long: number; wide: number };
}

export interface CharacterDetails {
  level: { value: number };
  xp: { value: number; min: number; max: number; pct: number };
  keyability: { value: AbilityKey };
  languages: { value: string[]; details: string };
  ancestry: { name: string; trait: string | null } | null;
  heritage: { name: string; trait: string | null } | null;
  class: { name: string; trait: string | null } | null;
  background?: { name: string } | null;
  deity?: { image?: string; value?: string } | null;
  biography: CharacterBiography;
  age: DemographicField;
  height: DemographicField;
  weight: DemographicField;
  gender: DemographicField;
  ethnicity: DemographicField;
  nationality: DemographicField;
  alliance: 'party' | 'opposition' | null;
}

export interface CharacterSystem {
  abilities: Record<AbilityKey, Ability>;
  attributes: {
    ac: ACAttribute;
    hp: HPAttribute;
    classDC: ClassDC | null;
    dying: Dying;
    wounded: Wounded;
    doomed: Doomed;
    immunities: IWREntry[];
    weaknesses: IWREntry[];
    resistances: IWREntry[];
    shield: Shield;
    reach: Reach;
    handsFree: number;
  };
  crafting: CraftingField;
  details: CharacterDetails;
  initiative: Initiative;
  perception: Perception;
  resources: {
    heroPoints: HeroPoints;
    focus: FocusPool;
    investiture: PointPool;
    mythicPoints: PointPool;
  };
  movement: Movement;
  traits: CharacterTraits;
  saves: Record<'fortitude' | 'reflex' | 'will', Save>;
  skills: Record<string, SkillStatistic>;
  proficiencies: {
    attacks: Record<string, MartialProficiency>;
    defenses: Record<string, MartialProficiency>;
    classDCs: Record<string, ClassDC>;
    spellcasting: SpellcastingProficiency;
  };
  actions: Strike[];
}
