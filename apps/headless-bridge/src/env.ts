export interface BridgeEnv {
  foundryUrl: string;
  foundryAdminKey: string;
  foundryMcpUrl: string;
  bridgeGmUser: string;
  bridgeGmPass: string;
  bridgeWorldId: string;
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

export function parseEnv(env: Record<string, string | undefined> = process.env): BridgeEnv {
  function required(key: string): string {
    const value = env[key];
    if (!value) throw new EnvError(`Missing required env var: ${key}`);
    return value;
  }
  function optional(key: string, defaultValue = ''): string {
    return env[key] ?? defaultValue;
  }

  return {
    foundryUrl: required('FOUNDRY_URL').replace(/\/$/, ''),
    foundryAdminKey: optional('FOUNDRY_ADMIN_KEY'),
    foundryMcpUrl: optional('FOUNDRY_MCP_URL', 'http://foundry-mcp:8765').replace(/\/$/, ''),
    bridgeGmUser: required('BRIDGE_GM_USER'),
    bridgeGmPass: optional('BRIDGE_GM_PASS'),
    bridgeWorldId: required('BRIDGE_WORLD_ID'),
  };
}
