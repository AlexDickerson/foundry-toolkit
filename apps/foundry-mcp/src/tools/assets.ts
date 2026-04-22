import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { FOUNDRY_DATA_DIR } from '../config.js';

export function registerAssetTools(mcp: McpServer): void {
  mcp.registerTool(
    'upload_asset',
    {
      title: 'Upload Asset',
      description:
        'Upload a file (image, audio, etc.) to the Foundry VTT Data directory. Returns the relative path for use in scene creation and other tools.',
      inputSchema: {
        path: z.string().describe('Destination path relative to Foundry Data dir (e.g. "maps/castle.png")'),
        data: z.string().describe('Base64-encoded file content'),
      },
    },
    async ({ path: relPath, data }): Promise<CallToolResult> => {
      try {
        const safePath = normalize(relPath);
        if (safePath.startsWith('..') || safePath.includes('/..') || safePath.includes('\\..')) {
          return { content: [{ type: 'text', text: 'Error: path must not escape the Data directory' }], isError: true };
        }
        const absPath = resolve(FOUNDRY_DATA_DIR, safePath);
        if (!absPath.startsWith(FOUNDRY_DATA_DIR)) {
          return { content: [{ type: 'text', text: 'Error: path must not escape the Data directory' }], isError: true };
        }
        await mkdir(dirname(absPath), { recursive: true });
        const buf = Buffer.from(data, 'base64');
        await writeFile(absPath, buf);
        return { content: [{ type: 'text', text: JSON.stringify({ path: safePath, bytes: buf.length }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
