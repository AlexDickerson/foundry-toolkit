import { ipcMain } from 'electron';
import type { ChatMessage, ChatModel } from '@foundry-toolkit/shared/types';
import { streamChat } from '@foundry-toolkit/ai/chat';
import { getPreparedCompendium } from '../compendium/singleton.js';

/** Max characters of page text to send as tool context. ~2K tokens. */
const TOOL_CONTEXT_LIMIT = 8000;

export function registerChatHandlers(getMainWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle(
    'chatSend',
    async (
      _e,
      args: { messages: ChatMessage[]; apiKey: string; model?: ChatModel; toolContext?: string; rulesMode?: boolean },
    ): Promise<void> => {
      if (!args?.apiKey) {
        throw new Error('chatSend: apiKey is required');
      }
      const win = getMainWindow();
      const sendChunk = (chunk: { type: string; text?: string; error?: string }) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('chat-chunk', chunk);
        }
      };

      try {
        // Route the chat agent's monster/item tool lookups through the
        // foundry-mcp-backed prepared compendium. Each call is resolved
        // at invocation time rather than captured up front so an IPC
        // racing the compendium init surfaces a clear error.
        const prepared = getPreparedCompendium();
        await streamChat({
          apiKey: args.apiKey,
          messages: args.messages ?? [],
          model: args.model,
          rulesMode: args.rulesMode,
          toolContext: args.toolContext,
          toolDeps: {
            searchMonsters: (q) => prepared.searchMonsters(q),
            searchItems: (q) => prepared.searchItems(q),
          },
          onChunk: sendChunk,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        sendChunk({ type: 'error', error: message });
      }
    },
  );

  ipcMain.handle('getToolPageContent', async (_e, toolUrl: string): Promise<string> => {
    const win = getMainWindow();
    if (!win) return '';

    let toolOrigin: string;
    try {
      toolOrigin = new URL(toolUrl).origin;
    } catch {
      return '';
    }

    // Try to extract just the main content area to avoid nav/sidebar/footer
    // noise eating into the context budget. Falls back to full body text.
    const EXTRACT_SCRIPT = `(() => {
      const el = document.querySelector('main, article, [role="main"], #content, .content');
      return (el || document.body).innerText;
    })()`;

    for (const frame of win.webContents.mainFrame.framesInSubtree) {
      try {
        if (new URL(frame.url).origin === toolOrigin) {
          const text: unknown = await frame.executeJavaScript(EXTRACT_SCRIPT);
          if (typeof text === 'string' && text.length > 0) {
            return text.slice(0, TOOL_CONTEXT_LIMIT);
          }
        }
      } catch {
        continue;
      }
    }
    return '';
  });
}
