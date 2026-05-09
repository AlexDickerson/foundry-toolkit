#!/usr/bin/env bash
# Foundry container entrypoint.
#
# Syncs the foundry-api-bridge module from /seed into /data/Data/modules/ on
# every boot, then execs into felddy's own entrypoint which downloads and
# launches Foundry.
#
# The module is bundled into the image and tracks image version — the
# previous "first-boot only" behaviour meant `docker pull && restart` left
# the old module in the volume, so image updates silently failed to propagate.
# User data for the module lives in Foundry's settings DB (not inside the
# module dir), so overwriting on every boot is safe.

set -euo pipefail

MODULE_SRC=/seed/modules/foundry-api-bridge
MODULE_DST=/data/Data/modules/foundry-api-bridge

mkdir -p "$(dirname "$MODULE_DST")"
rm -rf "$MODULE_DST"
cp -r "$MODULE_SRC" "$MODULE_DST"
echo "[foundry-toolkit] foundry-api-bridge synced → $MODULE_DST"

# felddy's entrypoint sources logging.sh and backoff.sh from /home/node.
cd /home/node
exec ./entrypoint.sh "$@"
