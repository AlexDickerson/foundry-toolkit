import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { isFoundryConnected } from '../bridge.js';
import { log } from '../logger.js';

export function registerDiagnosticTools(mcp: McpServer): void {
  mcp.registerTool(
    'get_logs',
    {
      title: 'Get Server Logs',
      description:
        'Retrieve recent foundry-mcp server log entries. Useful for debugging command failures, timeouts, and connection issues.',
      inputSchema: {
        n: z.number().optional().describe('Number of log entries to return (default 50, max 500)'),
        level: z.enum(['info', 'warn', 'error']).optional().describe('Filter to a specific log level'),
      },
    },
    async ({ n, level }): Promise<CallToolResult> => {
      let entries = log.tail(Math.min(n ?? 50, 500));
      if (level) {
        entries = entries.filter((e) => e.level === level);
      }
      return {
        content: [
          {
            type: 'text',
            text: entries.length
              ? entries.map((e) => `[${e.ts}] ${e.level.toUpperCase()} ${e.msg}`).join('\n')
              : 'No log entries found.',
          },
        ],
      };
    },
  );

  mcp.registerTool(
    'get_server_status',
    {
      title: 'Server Status',
      description: 'Check foundry-mcp server status: Foundry connection, active MCP sessions, uptime.',
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                foundryConnected: isFoundryConnected(),
                uptimeSeconds: Math.floor(process.uptime()),
                memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
