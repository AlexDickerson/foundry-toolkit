export interface HealthResponse {
  ok: boolean;
  foundryConnected: boolean;
}

export async function checkMcpHealth(mcpUrl: string): Promise<HealthResponse> {
  const response = await fetch(`${mcpUrl}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Health endpoint returned ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
