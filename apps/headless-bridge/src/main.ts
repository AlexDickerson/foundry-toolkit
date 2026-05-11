import { chromium } from 'playwright';
import { parseEnv } from './env.js';
import { loginToWorld } from './foundry.js';
import { checkMcpHealth } from './health.js';

const LOG = '[headless-bridge]';

// After a successful login, give the world time to load and the api-bridge
// module time to open its WebSocket to foundry-mcp before health checks begin.
const WARMUP_DELAY_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 30_000;
// Allow this many consecutive failures before crashing so a brief foundry-mcp
// restart or transient network hiccup doesn't cause an unnecessary restart.
const FAILURE_THRESHOLD = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const env = parseEnv();

  console.info(`${LOG} Starting`);
  console.info(`${LOG}   Foundry: ${env.foundryUrl}`);
  console.info(`${LOG}   World:   ${env.bridgeWorldId}`);
  console.info(`${LOG}   User:    ${env.bridgeGmUser}`);
  console.info(`${LOG}   MCP:     ${env.foundryMcpUrl}`);

  const browser = await chromium.launch({ headless: true });
  console.info(`${LOG} Chromium launched`);

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('crash', () => {
    console.error(`${LOG} Page crashed — exiting for Docker restart`);
    process.exit(1);
  });

  page.on('close', () => {
    console.error(`${LOG} Page closed unexpectedly — exiting for Docker restart`);
    process.exit(1);
  });

  // Surface Foundry JS errors at warn level so they appear in logs without
  // killing the container — PF2e and other systems emit non-fatal errors.
  page.on('pageerror', (err) => {
    console.warn(`${LOG} Foundry page error: ${err.message}`);
  });

  await loginToWorld(page, env);
  console.info(`${LOG} Login complete — waiting ${String(WARMUP_DELAY_MS / 1000)}s for bridge module to connect`);

  await sleep(WARMUP_DELAY_MS);

  let consecutiveFailures = 0;

  // Health is probed by hitting foundry-mcp's /health endpoint, which returns
  // { ok: true, foundryConnected: bool }. The bridge module opens a WebSocket
  // to foundry-mcp on startup; foundryConnected flips true once it's OPEN.
  const healthLoop = setInterval(() => {
    void (async () => {
      try {
        const health = await checkMcpHealth(env.foundryMcpUrl);
        if (health.foundryConnected) {
          if (consecutiveFailures > 0) {
            console.info(`${LOG} Bridge reconnected`);
          }
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          console.warn(`${LOG} Bridge not connected (${String(consecutiveFailures)}/${String(FAILURE_THRESHOLD)})`);
          if (consecutiveFailures >= FAILURE_THRESHOLD) {
            clearInterval(healthLoop);
            console.error(
              `${LOG} Bridge disconnected for ${String(FAILURE_THRESHOLD)} consecutive checks — exiting for Docker restart`,
            );
            process.exit(1);
          }
        }
      } catch (err) {
        consecutiveFailures++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`${LOG} Health check error: ${msg} (${String(consecutiveFailures)}/${String(FAILURE_THRESHOLD)})`);
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          clearInterval(healthLoop);
          console.error(`${LOG} Health checks failed repeatedly — exiting for Docker restart`);
          process.exit(1);
        }
      }
    })();
  }, HEALTH_POLL_INTERVAL_MS);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`${LOG} Fatal: ${msg}`);
  process.exit(1);
});
