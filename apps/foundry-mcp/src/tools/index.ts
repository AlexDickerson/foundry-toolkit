import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSceneTools } from './scenes.js';
import { registerActorTools } from './actors.js';
import { registerTokenTools } from './tokens.js';
import { registerAssetTools } from './assets.js';
import { registerDiagnosticTools } from './diagnostics.js';
import { registerImageTools } from './image.js';
import { registerCompendiumTools } from './compendium.js';

export function registerTools(mcp: McpServer): void {
  registerSceneTools(mcp);
  registerActorTools(mcp);
  registerTokenTools(mcp);
  registerAssetTools(mcp);
  registerDiagnosticTools(mcp);
  registerImageTools(mcp);
  registerCompendiumTools(mcp);
}
