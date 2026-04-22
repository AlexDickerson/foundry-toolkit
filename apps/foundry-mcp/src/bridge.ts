import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';
import { COMMAND_TIMEOUT_MS } from './config.js';
import { log } from './logger.js';

// ---------------------------------------------------------------------------
// Module-initiated bridge events — the module pushes these for things like
// pf2e ChoiceSet prompts that need a frontend user to answer. We keep a
// Map of unresolved prompts plus a lightweight SSE fan-out for frontend
// subscribers. The module's `sendEvent` awaits until the frontend POSTs a
// resolution via `resolveBridgeEvent` below.
// ---------------------------------------------------------------------------

interface PendingBridgeEvent {
  bridgeId: string;
  type: string;
  payload: unknown;
  createdAt: number;
}

const pendingBridgeEvents = new Map<string, PendingBridgeEvent>();
const sseSubscribers = new Set<(chunk: string) => void>();

export function getPendingBridgeEvents(): PendingBridgeEvent[] {
  return Array.from(pendingBridgeEvents.values());
}

export function subscribeToBridgeEvents(onEvent: (chunk: string) => void): () => void {
  sseSubscribers.add(onEvent);
  return () => {
    sseSubscribers.delete(onEvent);
  };
}

function broadcastSse(payload: { kind: 'added' | 'removed'; event: PendingBridgeEvent }): void {
  // SSE chunk format: "event: ...\ndata: ...\n\n" per the spec. Using a
  // single "data" line and a JSON payload keeps the frontend parser
  // trivial.
  const chunk = `data: ${JSON.stringify(payload)}\n\n`;
  for (const send of sseSubscribers) {
    try {
      send(chunk);
    } catch (err) {
      // Dead subscriber — best-effort drop it.
      sseSubscribers.delete(send);
      log.warn(`SSE subscriber write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Resolve a pending bridge event with a value produced by the frontend.
 *  Sends the reply back over the module socket and removes the pending
 *  entry. Returns true when the event existed; false when it had already
 *  been resolved / timed out / never registered. */
export function resolveBridgeEvent(bridgeId: string, data: unknown): boolean {
  const pending = pendingBridgeEvents.get(bridgeId);
  if (!pending) return false;
  pendingBridgeEvents.delete(bridgeId);
  broadcastSse({ kind: 'removed', event: pending });
  if (!foundrySocket || foundrySocket.readyState !== WebSocket.OPEN) {
    log.warn(`Bridge event ${bridgeId.slice(0, 8)} resolved but Foundry is disconnected`);
    return true;
  }
  foundrySocket.send(JSON.stringify({ bridgeId, success: true, data }));
  return true;
}

// ---------------------------------------------------------------------------
// Foundry Bridge — WebSocket connection to the Foundry module
// ---------------------------------------------------------------------------

interface PendingCommand {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
}

let foundrySocket: WebSocket | null = null;
const pendingCommands = new Map<string, PendingCommand>();

export function isFoundryConnected(): boolean {
  return foundrySocket?.readyState === WebSocket.OPEN;
}

export function sendCommand(type: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!foundrySocket || foundrySocket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Foundry module not connected'));
  }

  const id = randomUUID();
  const t0 = Date.now();
  log.info(`cmd >> ${type} [${id.slice(0, 8)}]`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      log.error(`cmd timeout: ${type} [${id.slice(0, 8)}] after ${COMMAND_TIMEOUT_MS}ms`);
      reject(new Error(`Command '${type}' timed out after ${COMMAND_TIMEOUT_MS}ms`));
    }, COMMAND_TIMEOUT_MS);

    pendingCommands.set(id, {
      resolve(data) {
        clearTimeout(timer);
        const elapsed = Date.now() - t0;
        const size = JSON.stringify(data).length;
        log.info(`cmd << ${type} [${id.slice(0, 8)}] ${elapsed}ms ${(size / 1024).toFixed(1)}KB`);
        resolve(data);
      },
      reject(err) {
        clearTimeout(timer);
        const elapsed = Date.now() - t0;
        log.error(`cmd !! ${type} [${id.slice(0, 8)}] ${elapsed}ms ${err.message}`);
        reject(err);
      },
    });

    foundrySocket!.send(JSON.stringify({ id, type, params }));
  });
}

/** Send a command to Foundry and wrap the result as an MCP tool response. */
export async function foundryTool(type: string, params: Record<string, unknown> = {}): Promise<CallToolResult> {
  try {
    const data = (await sendCommand(type, params)) as Record<string, unknown> | null;

    // capture-scene returns { image, mimeType, ... } — surface image as MCP image block
    if (data && typeof data.image === 'string' && typeof data.mimeType === 'string') {
      const { image, ...meta } = data;
      return {
        content: [
          { type: 'text', text: JSON.stringify(meta) },
          { type: 'image', data: image as string, mimeType: data.mimeType as string },
        ],
      };
    }

    // get-scene with includeScreenshot embeds screenshot as a nested object
    if (data?.screenshot && typeof (data.screenshot as Record<string, unknown>).image === 'string') {
      const ss = data.screenshot as { image: string; mimeType: string };
      const { screenshot: _, ...rest } = data;
      return {
        content: [
          { type: 'text', text: JSON.stringify(rest) },
          { type: 'image', data: ss.image, mimeType: ss.mimeType },
        ],
      };
    }

    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// WebSocket server — accepts one Foundry module connection
// ---------------------------------------------------------------------------

export const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket) => {
  if (foundrySocket) {
    log.warn('Rejecting duplicate Foundry connection');
    ws.close(4000, 'Only one Foundry module connection allowed');
    return;
  }

  foundrySocket = ws;
  log.info('Foundry module connected');

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

      // Module-initiated bridge event: store + broadcast for frontend
      // subscribers. The module is blocking on our reply; we dispatch
      // it from `resolveBridgeEvent` once the frontend POSTs back.
      if (typeof msg['bridgeId'] === 'string' && typeof msg['type'] === 'string' && 'payload' in msg) {
        const bridgeId = msg['bridgeId'];
        const type = msg['type'];
        const entry: PendingBridgeEvent = {
          bridgeId,
          type,
          payload: msg['payload'],
          createdAt: Date.now(),
        };
        pendingBridgeEvents.set(bridgeId, entry);
        broadcastSse({ kind: 'added', event: entry });
        log.info(`bridge-event << ${type} [${bridgeId.slice(0, 8)}]`);
        return;
      }

      // Command response: correlate against pendingCommands.
      if (typeof msg['id'] !== 'string' || typeof msg['success'] !== 'boolean') {
        log.warn(`Ignoring unrecognised Foundry message: ${JSON.stringify(msg).slice(0, 200)}`);
        return;
      }
      const response = msg as { id: string; success: boolean; data?: unknown; error?: string };
      const pending = pendingCommands.get(response.id);
      if (!pending) {
        log.warn(`Received response for unknown command: ${response.id.slice(0, 8)}`);
        return;
      }
      pendingCommands.delete(response.id);
      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error ?? 'Command failed'));
      }
    } catch (err) {
      log.error(`Failed to parse Foundry message: ${err}`);
    }
  });

  ws.on('close', () => {
    log.info('Foundry module disconnected');
    foundrySocket = null;
    for (const [id, pending] of pendingCommands) {
      pending.reject(new Error('Foundry module disconnected'));
      pendingCommands.delete(id);
    }
    // Any unanswered bridge events are dead — tell subscribers so the
    // frontend can clear its modal instead of staring at a stale prompt.
    for (const [bridgeId, entry] of pendingBridgeEvents) {
      pendingBridgeEvents.delete(bridgeId);
      broadcastSse({ kind: 'removed', event: entry });
    }
  });

  ws.on('error', (err: Error) => log.error(`Foundry WS error: ${err.message}`));
});
