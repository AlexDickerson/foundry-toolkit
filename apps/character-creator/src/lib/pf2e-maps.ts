import type { FeatCategory, ProficiencyRank } from '../api/types';

// PF2e proficiency-rank labels and palette.
// Labels match the en.json `PF2E.ProficiencyLevel{0..4}` keys; we duplicate
// them here because this map is keyed by number and used everywhere we
// render a rank chip. The colours are Tailwind classes inspired by pf2e's
// rank palette (dark green/blue/purple/amber) without vendoring Foundry's
// full SCSS token system.

export const RANK_LABEL: Record<ProficiencyRank, string> = {
  0: 'Untrained',
  1: 'Trained',
  2: 'Expert',
  3: 'Master',
  4: 'Legendary',
};

export const RANK_I18N_KEY: Record<ProficiencyRank, string> = {
  0: 'PF2E.ProficiencyLevel0',
  1: 'PF2E.ProficiencyLevel1',
  2: 'PF2E.ProficiencyLevel2',
  3: 'PF2E.ProficiencyLevel3',
  4: 'PF2E.ProficiencyLevel4',
};

// Rank chip backgrounds — mapped to the pf2e proficiency palette in
// src/styles/pf2e/tokens.css. The palette itself comes from pf2e's
// _colors.scss (Apache-2.0).
export const RANK_BG: Record<ProficiencyRank, string> = {
  0: 'bg-pf-prof-untrained',
  1: 'bg-pf-prof-trained',
  2: 'bg-pf-prof-expert',
  3: 'bg-pf-prof-master',
  4: 'bg-pf-prof-legendary',
};

// Martial proficiency labels don't ship on the payload — they're resolved
// on PF2e's sheet side via its own helpers. We map each slug to the i18n
// key pf2e's en.json defines under PF2E.Actor.Character.Proficiency.*.
// Unmapped slugs (e.g. user-added custom proficiencies) fall back to the
// slug itself so the UI stays readable.

export const ATTACK_LABEL_KEY: Record<string, string> = {
  simple: 'PF2E.Actor.Character.Proficiency.Attack.Simple',
  martial: 'PF2E.Actor.Character.Proficiency.Attack.Martial',
  advanced: 'PF2E.Actor.Character.Proficiency.Attack.Advanced',
  unarmed: 'PF2E.Actor.Character.Proficiency.Attack.Unarmed',
};

export const DEFENSE_LABEL_KEY: Record<string, string> = {
  unarmored: 'PF2E.Actor.Character.Proficiency.Defense.Unarmored',
  light: 'PF2E.Actor.Character.Proficiency.Defense.Light',
  medium: 'PF2E.Actor.Character.Proficiency.Defense.Medium',
  heavy: 'PF2E.Actor.Character.Proficiency.Defense.Heavy',
  'light-barding': 'PF2E.Actor.Character.Proficiency.Defense.LightBarding',
  'heavy-barding': 'PF2E.Actor.Character.Proficiency.Defense.HeavyBarding',
};

// Feat category → display label. pf2e's sheet has finer-grained
// groupings (class feat-1, class feat-2, ...) driven by level slots; we
// collapse to category in this viewer. Render order matches how the
// sheet typically lays them out.
export const FEAT_CATEGORY_ORDER: readonly FeatCategory[] = [
  'ancestry',
  'class',
  'classfeature',
  'skill',
  'general',
  'bonus',
  'pfsboon',
];

export const FEAT_CATEGORY_LABEL: Record<string, string> = {
  ancestry: 'Ancestry Feats',
  class: 'Class Feats',
  classfeature: 'Class Features',
  skill: 'Skill Feats',
  general: 'General Feats',
  bonus: 'Bonus Feats',
  pfsboon: 'PFS Boons',
};
