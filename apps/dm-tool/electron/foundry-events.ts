// Subscribes to foundry-mcp's `combat` SSE channel and forwards
// `combatant-update` events (initiative changes) to the renderer window
// via IPC. Reconnects automatically on disconnect.

import type { BrowserWindow } from 'electron';
import type { CombatantInitiativeEvent } from '@foundry-toolkit/shared/types';

const RECONNECT_DELAY_MS = 3000;

async function consumeCombatStream(url: string, getMainWindow: () => BrowserWindow | null): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.warn(`foundry-events: combat stream HTTP ${res.status.toString()}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json) as Record<string, unknown>;
        if (event['eventType'] !== 'combatant-update') continue;
        const cb = event['combatant'] as Record<string, unknown> | undefined;
        if (
          typeof event['encounterId'] === 'string' &&
          cb &&
          typeof cb['actorId'] === 'string' &&
          typeof cb['initiative'] === 'number'
        ) {
          const update: CombatantInitiativeEvent = {
            encounterId: event['encounterId'],
            actorId: cb['actorId'],
            initiative: cb['initiative'],
          };
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('combatant-initiative-update', update);
            console.info(
              `foundry-events: initiative update — actorId=${update.actorId} value=${update.initiative.toString()}`,
            );
          }
        }
      } catch {
        // malformed JSON line — skip
      }
    }
  }
}

/** Start a background loop that consumes the foundry-mcp combat SSE channel
 *  and pushes initiative-change events to the main window via IPC.
 *  Reconnects automatically on error or clean close. Fire-and-forget. */
export function startCombatEventStream(foundryMcpUrl: string, getMainWindow: () => BrowserWindow | null): void {
  const url = `${foundryMcpUrl.replace(/\/$/, '')}/api/events/combat/stream`;

  const loop = async (): Promise<void> => {
    while (true) {
      try {
        await consumeCombatStream(url, getMainWindow);
      } catch (err) {
        console.debug('foundry-events: combat stream disconnected:', (err as Error).message);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  };

  void loop();
}
