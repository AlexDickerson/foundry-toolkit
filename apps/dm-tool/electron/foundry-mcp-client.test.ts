import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callTool, type McpSession } from './foundry-mcp-client.js';

const SESSION: McpSession = { url: 'http://mcp:8765', sessionId: 'sid', nextId: 2 };

function sseResponse(payload: unknown): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n`, { status: 200 });
}

describe('callTool', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      sseResponse({ result: { content: [{ type: 'text', text: JSON.stringify({ path: 'maps/a.jpg', bytes: 42 }) }] } }),
    );
    const result = await callTool(SESSION, 'upload_asset', { path: 'maps/a.jpg', data: '' });
    expect(result).toEqual({ path: 'maps/a.jpg', bytes: 42 });
  });

  it('strips the "Error: " prefix when the tool response signals an error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      sseResponse({
        result: {
          content: [
            { type: 'text', text: "Error: EROFS: read-only file system, open '/foundry-data/Data/maps/x.jpg'" },
          ],
          isError: true,
        },
      }),
    );
    await expect(callTool(SESSION, 'upload_asset', { path: 'maps/x.jpg', data: '' })).rejects.toThrow(/^EROFS:/);
  });

  it('throws the original JSON-RPC error when there is no text content', async () => {
    vi.mocked(fetch).mockResolvedValue(sseResponse({ error: { message: 'Method not found' } }));
    await expect(callTool(SESSION, 'upload_asset', {})).rejects.toThrow('Method not found');
  });
});
