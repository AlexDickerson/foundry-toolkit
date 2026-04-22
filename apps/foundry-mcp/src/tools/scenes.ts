import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { foundryTool, sendCommand } from '../bridge.js';

export function registerSceneTools(mcp: McpServer): void {
  mcp.registerTool(
    'get_scenes_list',
    {
      title: 'List Scenes',
      description: 'List all scenes in the Foundry VTT world with id, name, active status, and thumbnail path',
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => foundryTool('get-scenes-list'),
  );

  mcp.registerTool(
    'get_scene',
    {
      title: 'Get Scene',
      description:
        'Get full detail for a scene: grid, tokens (with HP/AC/conditions), walls, lights, notes, ' +
        'drawings, regions, and an ASCII tactical map. Optionally include a WebP screenshot.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the currently active scene.'),
        includeScreenshot: z.boolean().optional().describe('Include a base64 WebP screenshot of the canvas'),
        include: z
          .array(z.enum(['tokens', 'walls', 'lights', 'notes', 'tiles', 'drawings', 'regions', 'asciiMap']))
          .optional()
          .describe('Sections to include in the response. Omit for all sections.'),
        center: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe('Center point in grid coordinates for a zoomed ASCII map view. Omit to show the full scene.'),
        radius: z
          .number()
          .optional()
          .describe('Radius in grid cells around center (default 12). Only used with center.'),
      },
    },
    async ({ sceneId, includeScreenshot, include, center, radius }): Promise<CallToolResult> =>
      foundryTool('get-scene', { sceneId, includeScreenshot, include, center, radius }),
  );

  mcp.registerTool(
    'activate_scene',
    {
      title: 'Activate Scene',
      description: 'Set a scene as the active scene visible to all players',
      inputSchema: {
        sceneId: z.string().describe('ID of the scene to activate'),
      },
    },
    async ({ sceneId }): Promise<CallToolResult> => foundryTool('activate-scene', { sceneId }),
  );

  mcp.registerTool(
    'capture_scene',
    {
      title: 'Capture Scene',
      description: 'Capture a WebP screenshot of the active scene canvas (includes grid overlay)',
      inputSchema: {},
    },
    async (): Promise<CallToolResult> => foundryTool('capture-scene'),
  );

  mcp.registerTool(
    'screenshot_scene',
    {
      title: 'Screenshot Scene',
      description:
        'Get a WebP screenshot of a scene showing its current state (map, tokens, lighting). Returns only the image.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the currently active scene.'),
      },
    },
    async ({ sceneId }): Promise<CallToolResult> => {
      try {
        const data = (await sendCommand('get-scene', { sceneId, includeScreenshot: true })) as Record<string, unknown>;
        const ss = data?.screenshot as { image: string; mimeType: string } | undefined;
        if (!ss?.image) {
          return {
            content: [
              { type: 'text', text: 'Error: No screenshot returned. The scene may not be rendered in the GM browser.' },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'image', data: ss.image, mimeType: ss.mimeType }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  mcp.registerTool(
    'create_scene',
    {
      title: 'Create Scene',
      description: 'Create a new scene in Foundry VTT with optional background image and grid settings',
      inputSchema: {
        name: z.string().describe('Scene name'),
        img: z
          .string()
          .optional()
          .describe('Background image path relative to Foundry Data dir (e.g. "maps/my_map.png")'),
        width: z.number().optional().describe('Scene width in pixels'),
        height: z.number().optional().describe('Scene height in pixels'),
        gridSize: z.number().optional().describe('Grid square size in pixels (default 100)'),
        gridUnits: z.string().optional().describe('Grid distance units (default "ft")'),
        gridDistance: z.number().optional().describe('Distance per grid square (default 5)'),
      },
    },
    async ({ name, img, width, height, gridSize, gridUnits, gridDistance }): Promise<CallToolResult> =>
      foundryTool('create-scene', { name, img, width, height, gridSize, gridUnits, gridDistance }),
  );

  mcp.registerTool(
    'create_walls',
    {
      title: 'Create Walls',
      description:
        'Draw one or more wall segments on a scene. Each wall is a line from (x1,y1) to (x2,y2) in pixels. Use grid size to convert grid coords to pixels.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the active scene.'),
        walls: z
          .array(
            z.object({
              c: z
                .tuple([z.number(), z.number(), z.number(), z.number()])
                .describe('Wall coordinates [x1, y1, x2, y2] in pixels'),
              move: z.number().optional().describe('Movement restriction: 0=none, 1=normal (default 1)'),
              sense: z.number().optional().describe('Perception restriction: 0=none, 1=normal (default 1)'),
              door: z.number().optional().describe('Door type: 0=none, 1=door, 2=secret (default 0)'),
            }),
          )
          .describe('Array of wall segments to create'),
      },
    },
    async ({ sceneId, walls }): Promise<CallToolResult> => foundryTool('create-walls', { sceneId, walls }),
  );

  mcp.registerTool(
    'create_scene_from_uvtt',
    {
      title: 'Create Scene from UVTT',
      description:
        'Create a Foundry scene with walls from a Universal VTT (.uvtt) file. ' +
        'The .uvtt contains wall segments (line_of_sight) and optional doors (portals) ' +
        'from Auto-Wall or similar tools. Upload the map image first via upload_asset, ' +
        'then pass the parsed .uvtt JSON here along with the image path.',
      inputSchema: {
        name: z.string().describe('Scene name'),
        img: z.string().optional().describe('Background image path relative to Foundry Data dir (from upload_asset)'),
        uvtt: z
          .object({
            resolution: z.object({
              pixels_per_grid: z.number().describe('Grid cell size in source image pixels'),
              map_size: z.object({ x: z.number(), y: z.number() }).describe('Map dimensions in grid cells'),
            }),
            line_of_sight: z
              .array(z.array(z.object({ x: z.number(), y: z.number() })))
              .describe('Wall segments as pairs of grid-relative points'),
            portals: z
              .array(
                z.object({
                  position: z.object({ x: z.number(), y: z.number() }),
                  bounds: z.array(z.object({ x: z.number(), y: z.number() })),
                  closed: z.boolean().optional(),
                }),
              )
              .optional()
              .describe('Door segments from the .uvtt file'),
          })
          .describe('Parsed .uvtt JSON content'),
        gridDistance: z.number().optional().describe('Distance per grid square (default 5)'),
        gridUnits: z.string().optional().describe('Grid distance units (default "ft")'),
        activate: z.boolean().optional().describe('Activate the scene after creation (default false)'),
      },
    },
    async ({ name, img, uvtt, gridDistance, gridUnits, activate }): Promise<CallToolResult> =>
      foundryTool('create-scene-from-uvtt', { name, img, uvtt, gridDistance, gridUnits, activate }),
  );

  mcp.registerTool(
    'delete_wall',
    {
      title: 'Delete Wall',
      description: 'Delete a wall segment from a scene',
      inputSchema: {
        wallId: z.string().describe('Wall ID to delete'),
        sceneId: z.string().optional().describe('Scene ID. Omit for the active scene.'),
      },
    },
    async ({ wallId, sceneId }): Promise<CallToolResult> => foundryTool('delete-wall', { wallId, sceneId }),
  );

  mcp.registerTool(
    'normalize_scene',
    {
      title: 'Normalize Scene',
      description:
        "Match a scene's canvas dimensions to its background image and remove padding. " +
        'After normalization, grid coordinate (col, row) → pixel = (col * gridSize, row * gridSize) with no offset. ' +
        'Returns the before/after dimensions and the grid column/row counts.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the active scene.'),
      },
    },
    async ({ sceneId }): Promise<CallToolResult> => foundryTool('normalize-scene', { sceneId }),
  );

  mcp.registerTool(
    'analyze_scene',
    {
      title: 'Analyze Scene Layout',
      description:
        'Sample the background image at each grid cell and return a classified ASCII grid map. ' +
        'Each cell is classified as: # (wall/structure), · (floor), ~ (outside/void), or space (transparent). ' +
        'Use this to understand the map layout before placing walls, tokens, or other elements. ' +
        'The scene should be normalized first (padding=0) for accurate coordinate mapping.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the active scene.'),
      },
    },
    async ({ sceneId }): Promise<CallToolResult> => foundryTool('analyze-scene', { sceneId }),
  );

  mcp.registerTool(
    'update_scene',
    {
      title: 'Update Scene',
      description: 'Update scene properties like background image, name, darkness, or grid settings.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the active scene.'),
        background: z.string().optional().describe('Background image path relative to Foundry Data dir'),
        name: z.string().optional().describe('Scene name'),
        darkness: z.number().optional().describe('Darkness level 0-1'),
        gridSize: z.number().optional().describe('Grid square size in pixels'),
        gridUnits: z.string().optional().describe('Grid distance units'),
        gridDistance: z.number().optional().describe('Distance per grid square'),
      },
    },
    async ({ sceneId, background, name, darkness, gridSize, gridUnits, gridDistance }): Promise<CallToolResult> =>
      foundryTool('update-scene', { sceneId, background, name, darkness, gridSize, gridUnits, gridDistance }),
  );

  mcp.registerTool(
    'get_scene_background',
    {
      title: 'Get Scene Background Image',
      description:
        "Retrieve the scene's background map image (without tokens or overlays). " +
        'Returns a WebP image scaled to fit within maxDimension pixels. ' +
        'Use this to visually analyze the map layout, corridors, and structures.',
      inputSchema: {
        sceneId: z.string().optional().describe('Scene ID. Omit for the active scene.'),
        maxDimension: z.number().optional().describe('Max width or height in pixels (default 2048)'),
      },
    },
    async ({ sceneId, maxDimension }): Promise<CallToolResult> => {
      try {
        const data = (await sendCommand('get-scene-background', { sceneId, maxDimension })) as Record<string, unknown>;
        if (!data?.image) {
          return { content: [{ type: 'text', text: 'Error: No background image returned.' }], isError: true };
        }
        return {
          content: [{ type: 'image', data: data.image as string, mimeType: data.mimeType as string }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
