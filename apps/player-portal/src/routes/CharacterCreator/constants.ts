import type { AbilityKey } from '../../api/types';
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
  skillPicks: [],
  languagePicks: [],
  classGrantsL1Feat: null,
  languageAllowance: null,
};

export const STEPS: readonly Step[] = [
  'identity',
  'ancestry',
  'class',
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
};

export const STATIC_PICKER_FILTERS: Record<
  Exclude<PickerTarget, 'heritage' | 'class-feat' | 'ancestry-feat'>,
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
