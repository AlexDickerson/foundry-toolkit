import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import OpenAI, { toFile } from 'openai';
import { sendCommand } from '../bridge.js';

export function registerImageTools(mcp: McpServer): void {
  mcp.registerTool(
    'edit_image',
    {
      title: 'Edit Image (AI)',
      description:
        'Use OpenAI GPT-image-1 to edit or annotate an image with a text prompt. ' +
        "Provide a sceneId to edit that scene's background, or pass raw base64 image data directly. " +
        'Examples: "draw a red dotted patrol route along the inner walls", ' +
        '"highlight the corridors in yellow", "circle the fountain area".',
      inputSchema: {
        prompt: z.string().describe('Editing instruction describing what to change or add to the image'),
        sceneId: z.string().optional().describe('Scene ID whose background to edit. Omit for active scene.'),
        image: z.string().optional().describe('Raw base64 image data. If provided, sceneId is ignored.'),
      },
    },
    async ({ prompt, sceneId, image }): Promise<CallToolResult> => {
      try {
        // Get the source image
        let imageData: string;
        if (image) {
          imageData = image;
        } else {
          const result = (await sendCommand('get-scene-background', { sceneId, maxDimension: 2048 })) as Record<
            string,
            unknown
          >;
          if (!result?.image) {
            return {
              content: [{ type: 'text', text: 'Error: Could not fetch scene background image.' }],
              isError: true,
            };
          }
          imageData = result.image as string;
        }

        // Send to OpenAI
        const openai = new OpenAI();
        const buffer = Buffer.from(imageData, 'base64');
        const file = await toFile(buffer, 'scene.webp', { type: 'image/webp' });

        const response = await openai.images.edit({
          model: 'gpt-image-1.5',
          image: file,
          prompt,
        });

        const editedData = response.data?.[0]?.b64_json;
        if (!editedData) {
          return { content: [{ type: 'text', text: 'Error: No image returned from OpenAI.' }], isError: true };
        }

        return {
          content: [{ type: 'image', data: editedData, mimeType: 'image/png' }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
