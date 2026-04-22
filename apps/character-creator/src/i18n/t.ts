import en from './en.json';

// Foundry's `label` fields are i18n keys like "PF2E.AbilityStr" — see the
// prepared-actor payload. Resolve them client-side against the vendored
// en.json. Unknown keys return the key itself so rendering never breaks.

type Node = string | { [k: string]: Node };

function lookup(key: string): string {
  const parts = key.split('.');
  let node: Node = en as Node;
  for (const part of parts) {
    if (typeof node !== 'object' || !(part in node)) {
      return key;
    }
    node = node[part] as Node;
  }
  return typeof node === 'string' ? node : key;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const str = lookup(key);
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const val = params[name];
    return val === undefined ? `{${name}}` : String(val);
  });
}
