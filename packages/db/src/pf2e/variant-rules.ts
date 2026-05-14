import { getPf2eDb } from './connection.js';
import { tryParseJson } from './internal.js';

const VARIANT_RULES_KEY = 'app:variant-rules';

export const KNOWN_VARIANT_RULE_KEYS: ReadonlySet<string> = new Set([
  'freeArchetype',
  'ancestryParagon',
  'dualClass',
  'automaticBonusProgression',
  'proficiencyWithoutLevel',
  'gradualAbilityBoosts',
]);

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

export function getVariantRules(): VariantRulesConfig {
  const row = getPf2eDb().prepare('SELECT value FROM settings WHERE key = ?').get(VARIANT_RULES_KEY) as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_VARIANT_RULES };
  const parsed = tryParseJson<Record<string, unknown>>(row.value, {});
  const overrides = Object.fromEntries(
    Object.entries(parsed)
      .filter(([k]) => KNOWN_VARIANT_RULE_KEYS.has(k))
      .map(([k, v]) => [k, Boolean(v)]),
  );
  return { ...DEFAULT_VARIANT_RULES, ...overrides };
}

export function setVariantRules(config: VariantRulesConfig): void {
  getPf2eDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(VARIANT_RULES_KEY, JSON.stringify(config));
}
