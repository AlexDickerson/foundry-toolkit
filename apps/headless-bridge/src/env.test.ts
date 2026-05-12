import { describe, it, expect } from 'vitest';
import { parseEnv, EnvError } from './env.js';

const BASE_ENV = {
  FOUNDRY_URL: 'http://foundry:30000',
  BRIDGE_GM_USER: 'Bridge GM',
  BRIDGE_WORLD_ID: 'my-campaign',
};

describe('parseEnv', () => {
  it('parses required and optional fields', () => {
    const env = parseEnv({
      ...BASE_ENV,
      FOUNDRY_ADMIN_KEY: 'secret',
      FOUNDRY_MCP_URL: 'http://mcp:8765',
      BRIDGE_GM_PASS: 'pw',
    });
    expect(env.foundryUrl).toBe('http://foundry:30000');
    expect(env.foundryAdminKey).toBe('secret');
    expect(env.foundryMcpUrl).toBe('http://mcp:8765');
    expect(env.bridgeGmUser).toBe('Bridge GM');
    expect(env.bridgeGmPass).toBe('pw');
    expect(env.bridgeWorldId).toBe('my-campaign');
  });

  it('strips trailing slash from FOUNDRY_URL', () => {
    const env = parseEnv({ ...BASE_ENV, FOUNDRY_URL: 'http://foundry:30000/' });
    expect(env.foundryUrl).toBe('http://foundry:30000');
  });

  it('strips trailing slash from FOUNDRY_MCP_URL', () => {
    const env = parseEnv({ ...BASE_ENV, FOUNDRY_MCP_URL: 'http://foundry-mcp:8765/' });
    expect(env.foundryMcpUrl).toBe('http://foundry-mcp:8765');
  });

  it('defaults FOUNDRY_MCP_URL to http://foundry-mcp:8765', () => {
    const env = parseEnv(BASE_ENV);
    expect(env.foundryMcpUrl).toBe('http://foundry-mcp:8765');
  });

  it('defaults optional fields to empty string', () => {
    const env = parseEnv(BASE_ENV);
    expect(env.foundryAdminKey).toBe('');
    expect(env.bridgeGmPass).toBe('');
    expect(env.foundryRoutePath).toBe('');
  });

  it('converts FOUNDRY_ROUTE_PREFIX to a leading-slash path', () => {
    const env = parseEnv({ ...BASE_ENV, FOUNDRY_ROUTE_PREFIX: 'foundry' });
    expect(env.foundryRoutePath).toBe('/foundry');
  });

  it('strips surrounding slashes from FOUNDRY_ROUTE_PREFIX', () => {
    const env = parseEnv({ ...BASE_ENV, FOUNDRY_ROUTE_PREFIX: '/foundry/' });
    expect(env.foundryRoutePath).toBe('/foundry');
  });

  it('throws EnvError when FOUNDRY_URL is missing', () => {
    const { FOUNDRY_URL: _, ...rest } = BASE_ENV;
    expect(() => parseEnv(rest)).toThrow(EnvError);
    expect(() => parseEnv(rest)).toThrow('FOUNDRY_URL');
  });

  it('throws EnvError when BRIDGE_GM_USER is missing', () => {
    const { BRIDGE_GM_USER: _, ...rest } = BASE_ENV;
    expect(() => parseEnv(rest)).toThrow(EnvError);
    expect(() => parseEnv(rest)).toThrow('BRIDGE_GM_USER');
  });

  it('throws EnvError when BRIDGE_WORLD_ID is missing', () => {
    const { BRIDGE_WORLD_ID: _, ...rest } = BASE_ENV;
    expect(() => parseEnv(rest)).toThrow(EnvError);
    expect(() => parseEnv(rest)).toThrow('BRIDGE_WORLD_ID');
  });
});
