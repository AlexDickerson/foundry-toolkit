import type { AbilityKey } from '@/features/characters/types';
import type { Draft, PickerFilters, PickerTarget, Step } from './types';

export const EMPTY_DRAFT: Draft = {
  name: '',
  gender: '',
  age: '',
  ethnicity: '',
  nationality: '',
  deity: null,
  ancestry: null,
  ancestrySlug: null,
  heritage: null,
  heritageSlug: null,
  class: null,
  classSlug: null,
  background: null,
  classFeat: null,
  ancestryFeat: null,
  levelOneBoosts: [],
  ancestryBoosts: [],
  backgroundBoosts: [],
  classKeyAbility: null,
  alternateAncestryBoosts: null,
  skillPicks: [],
  languagePicks: [],
  classGrantsL1Feat: null,
  languageAllowance: null,
  archetypeFeat: null,
};

// Full ordered list of every possible step. CharacterCreator filters
// this based on active variant rules to derive the visible step sequence.
export const STEPS: readonly Step[] = [
  'identity',
  'ancestry',
  'class',
  'archetype',
  'background',
  'attributes',
  'skills',
  'languages',
  'review',
];

export const STEP_LABEL: Record<Step, string> = {
  identity: 'Identity',
  ancestry: 'Ancestry',
  class: 'Class',
  archetype: 'Archetype',
  background: 'Background',
  attributes: 'Attributes',
  skills: 'Skills',
  languages: 'Languages',
  review: 'Review',
};

export const PICKER_LABEL: Record<PickerTarget, string> = {
  ancestry: 'Ancestry',
  heritage: 'Heritage',
  class: 'Class',
  background: 'Background',
  deity: 'Deity',
  'class-feat': 'Class Feat',
  'ancestry-feat': 'Ancestry Feat',
  'archetype-dedication': 'Archetype Dedication',
};

export const STATIC_PICKER_FILTERS: Record<
  Exclude<PickerTarget, 'heritage' | 'class-feat' | 'ancestry-feat' | 'archetype-dedication'>,
  PickerFilters
> = {
  ancestry: { packIds: ['pf2e.ancestries'], documentType: 'Item' },
  class: { packIds: ['pf2e.classes'], documentType: 'Item' },
  background: { packIds: ['pf2e.backgrounds'], documentType: 'Item' },
  deity: { packIds: ['pf2e.deities'], documentType: 'Item' },
};

export const BOOSTS_REQUIRED = 4;

export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
