import { requestJson } from '@foundry-toolkit/shared/http';
import type { VariantRulesConfig } from './types';

const BASE = '/api/mcp';

export async function getVariantRules(): Promise<VariantRulesConfig> {
  return requestJson<VariantRulesConfig>(`${BASE}/variant-rules`);
}

export async function putVariantRules(patch: Partial<VariantRulesConfig>): Promise<VariantRulesConfig> {
  return requestJson<VariantRulesConfig>(`${BASE}/variant-rules`, {
    method: 'PUT',
    body: JSON.stringify(patch),
    headers: { 'Content-Type': 'application/json' },
  });
}
