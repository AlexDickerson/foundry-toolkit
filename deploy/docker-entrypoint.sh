#!/usr/bin/env bash
# All-in-one entrypoint wrapper.
#
# Runs before handing off to the original felddy entrypoint:
#   1. Seeds the foundry-api-bridge module into /data/Data/modules/ if not
#      already present (idempotent — skips on subsequent boots).
#   2. Starts foundry-mcp in the background.
#   3. Starts player-portal in the background.
#   4. Execs into felddy's ./entrypoint.sh, which downloads + launches Foundry.
#
# Background processes inherit the container's stdout/stderr, so their logs
# appear in `docker logs`.  If mcp or portal crash, restart the container —
# there is no automatic process-restart in this wrapper.

set -euo pipefail

MODULE_SRC=/seed/modules/foundry-api-bridge
MODULE_DST=/data/Data/modules/foundry-api-bridge

# ── 1. Seed foundry-api-bridge ────────────────────────────────────────────────
if [ ! -d "$MODULE_DST" ]; then
  mkdir -p "$(dirname "$MODULE_DST")"
  cp -r "$MODULE_SRC" "$MODULE_DST"
  echo "[foundry-toolkit] foundry-api-bridge installed → $MODULE_DST"
else
  echo "[foundry-toolkit] foundry-api-bridge already present at $MODULE_DST"
fi

# Ensure foundry-mcp's database directory exists inside the persistent volume.
# /app/mcp is root-owned; LIVE_DB_PATH redirects the SQLite file to /data/mcp/
# which is writable by the node user that runs all services.
mkdir -p /data/mcp

# ── 2. Start foundry-mcp ──────────────────────────────────────────────────────
echo "[foundry-toolkit] Starting foundry-mcp (port 8765)..."
(cd /app/mcp && node_modules/.bin/tsx apps/foundry-mcp/src/index.ts) &
echo "[foundry-toolkit] foundry-mcp started (pid $!)"

# ── 3. Start player-portal ────────────────────────────────────────────────────
echo "[foundry-toolkit] Starting player-portal (port 3000)..."
node /app/portal/server-dist/index.js &
echo "[foundry-toolkit] player-portal started (pid $!)"

# ── 4. Hand off to felddy entrypoint ─────────────────────────────────────────
# The felddy entrypoint sources ./logging.sh and ./backoff.sh, so we must be
# in /home/node when we exec it.  The CMD args ("$@") are forwarded as-is:
#   resources/app/main.mjs --port=30000 --headless --noupdate --dataPath=/data
cd /home/node
exec ./entrypoint.sh "$@"
