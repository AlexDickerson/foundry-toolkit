import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushToFoundryMcp, pushToSidecar } from './sidecar-client.js';
import type { DmToolConfig } from './config.js';

const BASE_CONFIG: Pick<DmToolConfig, 'libraryPath' | 'indexDbPath' | 'inboxPath' | 'quarantinePath'> = {
  libraryPath: '/lib',
  indexDbPath: '/lib/index.db',
  inboxPath: '/inbox',
  quarantinePath: '/quarantine',
};

function cfg(overrides: Partial<DmToolConfig> = {}): DmToolConfig {
  return { ...BASE_CONFIG, ...overrides } as DmToolConfig;
}

describe('pushToSidecar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op when sidecarUrl is not configured', async () => {
    await pushToSidecar(cfg(), '/api/live/inventory', {}, 'test');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is a no-op when sidecarSecret is not configured', async () => {
    await pushToSidecar(cfg({ sidecarUrl: 'http://sidecar:3000' }), '/api/live/inventory', {}, 'test');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs to sidecarUrl with Bearer auth', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const body = { items: [], updatedAt: '2024-01-01T00:00:00.000Z' };
    await pushToSidecar(
      cfg({ sidecarUrl: 'http://sidecar:3000', sidecarSecret: 'abc' }),
      '/api/live/inventory',
      body,
      'inventory',
    );
    expect(fetch).toHaveBeenCalledWith('http://sidecar:3000/api/live/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc' },
      body: JSON.stringify(body),
    });
  });

  it('strips trailing slash from sidecarUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await pushToSidecar(
      cfg({ sidecarUrl: 'http://sidecar:3000/', sidecarSecret: 'x' }),
      '/api/live/aurus',
      {},
      'aurus',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://sidecar:3000/api/live/aurus');
  });

  it('swallows non-2xx responses', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      pushToSidecar(cfg({ sidecarUrl: 'http://sidecar:3000', sidecarSecret: 'x' }), '/api/live/inventory', {}, 'test'),
    ).resolves.toBeUndefined();
  });

  it('swallows network errors', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      pushToSidecar(cfg({ sidecarUrl: 'http://sidecar:3000', sidecarSecret: 'x' }), '/api/live/inventory', {}, 'test'),
    ).resolves.toBeUndefined();
  });
});

describe('pushToFoundryMcp', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op when foundryMcpUrl is not configured', async () => {
    await pushToFoundryMcp(cfg(), '/api/live/inventory', {}, 'test');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs to foundryMcpUrl without auth when sidecarSecret is unset', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const body = { items: [], updatedAt: '2024-01-01T00:00:00.000Z' };
    await pushToFoundryMcp(cfg({ foundryMcpUrl: 'http://mcp:8765' }), '/api/live/inventory', body, 'inventory');
    expect(fetch).toHaveBeenCalledWith('http://mcp:8765/api/live/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('includes Bearer auth when sidecarSecret is set', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await pushToFoundryMcp(
      cfg({ foundryMcpUrl: 'http://mcp:8765', sidecarSecret: 'secret' }),
      '/api/live/aurus',
      {},
      'aurus',
    );
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret');
  });

  it('strips trailing slash from foundryMcpUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await pushToFoundryMcp(cfg({ foundryMcpUrl: 'http://mcp:8765/' }), '/api/live/globe', {}, 'globe');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('http://mcp:8765/api/live/globe');
  });

  it('swallows non-2xx responses', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      pushToFoundryMcp(cfg({ foundryMcpUrl: 'http://mcp:8765' }), '/api/live/inventory', {}, 'test'),
    ).resolves.toBeUndefined();
  });

  it('swallows network errors', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      pushToFoundryMcp(cfg({ foundryMcpUrl: 'http://mcp:8765' }), '/api/live/inventory', {}, 'test'),
    ).resolves.toBeUndefined();
  });
});
