#!/usr/bin/env bash
# Foundry container entrypoint.
#
# Seeds the foundry-api-bridge module into /data/Data/modules/ on first boot
# (idempotent — skips on subsequent boots so volume overrides are preserved),
# then execs into felddy's own entrypoint which downloads and launches Foundry.

set -euo pipefail

MODULE_SRC=/seed/modules/foundry-api-bridge
MODULE_DST=/data/Data/modules/foundry-api-bridge

if [ ! -d "$MODULE_DST" ]; then
  mkdir -p "$(dirname "$MODULE_DST")"
  cp -r "$MODULE_SRC" "$MODULE_DST"
  echo "[foundry-toolkit] foundry-api-bridge installed → $MODULE_DST"
else
  echo "[foundry-toolkit] foundry-api-bridge already present at $MODULE_DST"
fi

# felddy's entrypoint sources logging.sh and backoff.sh from /home/node.
cd /home/node
exec ./entrypoint.sh "$@"
