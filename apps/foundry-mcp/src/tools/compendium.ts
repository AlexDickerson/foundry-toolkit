import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { foundryTool } from '../bridge.js';

export function registerCompendiumTools(mcp: McpServer): void {
  mcp.registerTool(
    'find_in_compendium',
    {
      title: 'Find in Compendium',
      description:
        'Search compendium packs for documents whose name contains every word of the query (case-insensitive, word-order independent). A single-word query behaves like a substring match; "adult blue dragon" also matches "Blue Dragon (Adult)". Returns lean matches suitable for passing to create_actor_from_compendium or add_item_from_compendium. Results are ranked exact → phrase prefix → phrase contained → tokens scattered, alphabetically within each tier.',
      inputSchema: {
        name: z.string().describe('Name substring to search for (case-insensitive)'),
        packId: z.string().optional().describe('Restrict to a single pack (e.g. "pf2e.pathfinder-bestiary")'),
        documentType: z
          .string()
          .optional()
          .describe('Restrict to packs of this document type (e.g. "Actor", "Item", "JournalEntry")'),
        limit: z.number().int().positive().optional().describe('Max results (default 10, hard-capped at 100)'),
      },
    },
    async ({ name, packId, documentType, limit }): Promise<CallToolResult> =>
      foundryTool('find-in-compendium', { name, packId, documentType, limit }),
  );

  mcp.registerTool(
    'find_or_create_folder',
    {
      title: 'Find or Create Folder',
      description:
        'Idempotently find an existing folder by name + document type, or create it if absent. Returns the folder id plus a flag indicating whether a new folder was created. Useful for organizing batches of generated documents — e.g. dropping all actors created for one encounter into a single named folder.',
      inputSchema: {
        name: z.string().describe('Folder name'),
        type: z
          .enum(['Actor', 'Item', 'Scene', 'JournalEntry', 'RollTable', 'Macro', 'Playlist', 'Adventure', 'Card'])
          .describe(
            'Document type the folder holds. Foundry scopes folder names by type, so the same name can coexist across different types.',
          ),
        parentFolderId: z.string().optional().describe('Optional parent folder ID to nest under'),
      },
    },
    async ({ name, type, parentFolderId }): Promise<CallToolResult> =>
      foundryTool('find-or-create-folder', { name, type, parentFolderId }),
  );
}
