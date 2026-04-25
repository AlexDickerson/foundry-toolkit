import type { BrowserWindow } from 'electron';
import type { ActorHpUpdate } from '@foundry-toolkit/shared/types';

/** Returns true when a Foundry update-diff path indicates an HP change. */
export function isHpPath(path: string): boolean {
  return path === 'system.attributes.hp' || path.startsWith('system.attributes.hp.');
}

interface ActorsEvent {
  actorId: string;
  changedPaths: string[];
}

/** Parse a raw `data:` SSE line value into an ActorsEvent, or null on failure. */
export function parseActorsEvent(raw: string): ActorsEvent | null {
  try {
    const evt = JSON.parse(raw) as Record<string, unknown>;
    if (typeof evt['actorId'] !== 'string' || !Array.isArray(evt['changedPaths'])) return null;
    return { actorId: evt['actorId'], changedPaths: evt['changedPaths'] as string[] };
  } catch {
    return null;
  }
}

async function fetchActorHp(base: string, actorId: string, signal: AbortSignal): Promise<ActorHpUpdate | null> {
  try {
    const res = await fetch(`${base}/api/actors/${actorId}`, { signal });
    if (!res.ok) {
      console.warn(`actor-hp-watcher: GET /api/actors/${actorId} returned HTTP ${res.status}`);
      return null;
    }
    const actor = (await res.json()) as { system?: unknown };
    const sys = actor.system as Record<string, unknown> | undefined;
    const attrs = sys?.['attributes'] as Record<string, unknown> | undefined;
    const hpBlock = attrs?.['hp'] as Record<string, unknown> | undefined;
    const hp = hpBlock?.['value'];
    const maxHp = hpBlock?.['max'];
    if (typeof hp !== 'number' || typeof maxHp !== 'number') return null;
    return { actorId, hp, maxHp };
  } catch (e) {
    const err = e as Error;
    if (err.name !== 'AbortError') {
      console.warn(`actor-hp-watcher: error fetching actor ${actorId}:`, err.message);
    }
    return null;
  }
}

async function runStream(base: string, signal: AbortSignal, onUpdate: (u: ActorHpUpdate) => void): Promise<void> {
  const res = await fetch(`${base}/api/events/actors/stream`, {
    signal,
    headers: { Accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) {
    throw new Error(`actors SSE: HTTP ${res.status}`);
  }

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith('data:')) continue;
        const evt = parseActorsEvent(trimmed.slice(5).trim());
        if (evt && evt.changedPaths.some(isHpPath)) {
          void fetchActorHp(base, evt.actorId, signal).then((u) => {
            if (u) onUpdate(u);
          });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function startActorHpWatcher(
  foundryMcpUrl: string,
  getMainWindow: () => BrowserWindow | null,
): { stop: () => void } {
  const controller = new AbortController();
  const base = foundryMcpUrl.replace(/\/$/, '');

  const onUpdate = (update: ActorHpUpdate) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('actor-hp-updated', update);
    }
  };

  const loop = async () => {
    while (!controller.signal.aborted) {
      try {
        await runStream(base, controller.signal, onUpdate);
      } catch (e) {
        if (controller.signal.aborted) break;
        console.warn('actor-hp-watcher: stream disconnected, retrying in 5s:', (e as Error).message);
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 5_000);
          controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  };

  void loop();
  return { stop: () => controller.abort() };
}
