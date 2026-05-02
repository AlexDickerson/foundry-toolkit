#!/usr/bin/env bash
set -euo pipefail

# Downloads the latest map-tagger release exe into tagger/dist/
# so electron-builder can package dm-tool without a local Python install.
#
# Requires: gh CLI (https://cli.github.com/) with gh auth login.

REPO="AlexDickerson/foundry-toolkit"
DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"
mkdir -p "$DIST"

echo "Fetching latest tagger release from $REPO..."
gh release download --repo "$REPO" --pattern "map-tagger-*.exe" --dir "$DIST" --clobber

versioned=$(ls "$DIST"/map-tagger-*.exe 2>/dev/null | head -1)
if [ -z "$versioned" ]; then
  echo "No map-tagger-*.exe found in dist/ after download" >&2
  exit 1
fi

mv -f "$versioned" "$DIST/map-tagger.exe"
echo "Ready: $DIST/map-tagger.exe"
