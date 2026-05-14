// Client-side type mirror of packages/db VariantRulesConfig.
// Must match the API response shape from GET /api/mcp/variant-rules.
export interface VariantRulesConfig {
  freeArchetype: boolean;
  ancestryParagon: boolean;
  dualClass: boolean;
  automaticBonusProgression: boolean;
  proficiencyWithoutLevel: boolean;
  gradualAbilityBoosts: boolean;
}

export const DEFAULT_VARIANT_RULES: VariantRulesConfig = {
  freeArchetype: false,
  ancestryParagon: false,
  dualClass: false,
  automaticBonusProgression: false,
  proficiencyWithoutLevel: false,
  gradualAbilityBoosts: false,
};
