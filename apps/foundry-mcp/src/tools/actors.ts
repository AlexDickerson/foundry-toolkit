import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { foundryTool } from '../bridge.js';

export function registerActorTools(mcp: McpServer): void {
  mcp.registerTool(
    'get_world_info',
    {
      title: 'Get World Info',
      description: 'Get world metadata: name, system, version, and document counts (actors, scenes, journals, items)',
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => foundryTool('get-world-info'),
  );

  mcp.registerTool(
    'get_actors',
    {
      title: 'List Actors',
      description: 'List all actors in the world with id, name, type, and image',
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => foundryTool('get-actors'),
  );

  mcp.registerTool(
    'get_actor',
    {
      title: 'Get Actor',
      description: 'Get full detail for an actor including system data and item inventory',
      inputSchema: {
        actorId: z.string().describe('Actor ID'),
      },
    },
    async ({ actorId }): Promise<CallToolResult> => foundryTool('get-actor', { actorId }),
  );

  mcp.registerTool(
    'create_actor',
    {
      title: 'Create Actor',
      description: 'Create a new actor in the world',
      inputSchema: {
        name: z.string().describe('Actor name'),
        type: z.string().describe('Actor type (e.g. "character", "npc")'),
        folder: z.string().optional().describe('Folder ID to place the actor in'),
        img: z.string().optional().describe('Token/portrait image path'),
        system: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('System-specific data (e.g. PF2e ability scores)'),
      },
    },
    async ({ name, type, folder, img, system }): Promise<CallToolResult> =>
      foundryTool('create-actor', { name, type, folder, img, system }),
  );

  mcp.registerTool(
    'create_actor_from_compendium',
    {
      title: 'Create Actor from Compendium',
      description: 'Import an actor from a compendium pack into the world',
      inputSchema: {
        packId: z.string().describe('Compendium pack ID (e.g. "pf2e.pathfinder-bestiary")'),
        actorId: z.string().describe('Actor ID within the compendium'),
        name: z.string().optional().describe('Override name for the imported actor'),
        folder: z.string().optional().describe('Folder ID to place the actor in'),
      },
    },
    async ({ packId, actorId, name, folder }): Promise<CallToolResult> =>
      foundryTool('create-actor-from-compendium', { packId, actorId, name, folder }),
  );

  mcp.registerTool(
    'update_actor',
    {
      title: 'Update Actor',
      description: "Update an existing actor's name, image, folder, or system data",
      inputSchema: {
        actorId: z.string().describe('Actor ID'),
        name: z.string().optional().describe('New name'),
        img: z.string().optional().describe('New image path'),
        folder: z.string().optional().describe('New folder ID'),
        system: z.record(z.string(), z.unknown()).optional().describe('System-specific data to merge'),
      },
    },
    async ({ actorId, name, img, folder, system }): Promise<CallToolResult> =>
      foundryTool('update-actor', { actorId, name, img, folder, system }),
  );

  mcp.registerTool(
    'delete_actor',
    {
      title: 'Delete Actor',
      description: 'Permanently delete an actor from the world',
      inputSchema: {
        actorId: z.string().describe('Actor ID to delete'),
      },
    },
    async ({ actorId }): Promise<CallToolResult> => foundryTool('delete-actor', { actorId }),
  );
}
