import type { ModuleConfig } from '@/config/types';
import { DEFAULT_CONFIG } from '@/config/defaults';

const MODULE_ID = 'foundry-api-bridge';
const CONFIG_KEY = 'config';

export function registerSettings(): void {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }
  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  game.settings.register(MODULE_ID, CONFIG_KEY, {
    name: 'Module Configuration',
    scope: 'world',
    config: false,
    type: Object,
    default: DEFAULT_CONFIG,
  });

  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  game.settings.register(MODULE_ID, 'wsUrl', {
    name: 'WebSocket URL',
    hint: 'URL for WebSocket connection to the server',
    scope: 'world',
    config: true,
    type: String,
    // foundry-mcp patch: default points at the self-hosted MCP server's Foundry endpoint instead of the upstream SaaS host. See PATCHES.md for the original value.
    default: 'ws://127.0.0.1:8765/foundry',
    requiresReload: true,
  });

  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  game.settings.register(MODULE_ID, 'apiKey', {
    name: 'API Key',
    hint: 'API key for server authorization (format: pk_...)',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    requiresReload: true,
  });

  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  game.settings.register(MODULE_ID, 'additionalWsUrls', {
    name: 'Additional WebSocket URLs (dev)',
    hint: 'Extra servers, one per line. Format: ws://host:port/foundry (uses primary API Key) or ws://host:port/foundry|pk_xxx (explicit key). Blank lines and # comments ignored.',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    requiresReload: true,
  });
}

export async function registerMenu(): Promise<void> {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }

  const { ApiConfigForm } = await import('@/ui/ApiConfigForm');

  game.settings.registerMenu(MODULE_ID, 'configMenu', {
    name: 'Configure Module',
    label: 'Configure',
    hint: 'Configure WebSocket and logging settings',
    icon: 'fas fa-cog',
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    type: ApiConfigForm as unknown as new () => FormApplication,
    restricted: true,
  });
}

export function getWsUrl(): string {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }
  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  return game.settings.get(MODULE_ID, 'wsUrl') as string;
}

export function getApiKey(): string {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }
  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  return game.settings.get(MODULE_ID, 'apiKey') as string;
}

export function getAdditionalWsUrls(): string {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }
  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  return game.settings.get(MODULE_ID, 'additionalWsUrls') as string;
}

export interface ServerConfig {
  url: string;
  apiKey: string;
}

// Parse the combined primary + additional server list. Additional
// entries are `url` or `url|apiKey`, one per line; blank lines and
// `#` comments are skipped. Entries without a pipe inherit the
// primary apiKey so dev servers sharing a key only need the URL.
// Callers get an empty list when primary is missing either field
// *and* additional has no fully-specified entries.
export function parseServerConfigs(
  primaryUrl: string,
  primaryApiKey: string,
  additionalWsUrls: string,
): ServerConfig[] {
  const configs: ServerConfig[] = [];

  if (primaryUrl && primaryApiKey) {
    configs.push({ url: primaryUrl, apiKey: primaryApiKey });
  }

  for (const rawLine of additionalWsUrls.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const pipe = line.indexOf('|');
    const url = pipe === -1 ? line : line.slice(0, pipe).trim();
    const key = pipe === -1 ? primaryApiKey : line.slice(pipe + 1).trim();
    if (!url || !key) continue;

    configs.push({ url, apiKey: key });
  }

  return configs;
}

export function getConfig(): ModuleConfig {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }
  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  const config = game.settings.get(MODULE_ID, CONFIG_KEY);
  return config as ModuleConfig;
}

export async function setConfig(config: ModuleConfig): Promise<void> {
  if (!game.settings) {
    throw new Error('game.settings is not available');
  }
  // @ts-expect-error v13 types narrowed namespace to 'core'; our custom module namespace is valid at runtime
  await game.settings.set(MODULE_ID, CONFIG_KEY, config);
}
