// Best-effort POST of live-state snapshots to foundry-mcp. Callers assume
// the local SQLite write has already succeeded — remote failures are logged
// as warnings and swallowed so they never surface to the user.

import type { DmToolConfig } from './config.js';

/**
 * Best-effort POST of a JSON payload to a foundry-mcp /api/live/* endpoint.
 * Silent no-op if foundryMcpUrl is not configured.
 * Auth header is included when sidecarSecret is set.
 */
export async function pushToFoundryMcp(cfg: DmToolConfig, path: string, body: unknown, label: string): Promise<void> {
  if (!cfg.foundryMcpUrl) return;
  const url = `${cfg.foundryMcpUrl.replace(/\/+$/, '')}${path}`;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.sidecarSecret) headers['Authorization'] = `Bearer ${cfg.sidecarSecret}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      console.warn(`${label} foundry-mcp push failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.warn(`${label} foundry-mcp push error:`, (err as Error).message);
  }
}
