export interface HealthResponse {
  ok: boolean;
  foundryConnected: boolean;
}

const HEALTH_TIMEOUT_MS = 5_000;

export async function checkMcpHealth(mcpUrl: string): Promise<HealthResponse> {
  const response = await fetch(`${mcpUrl}/health`, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Health endpoint returned ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
