###############################################################################
# foundry-toolkit — all-in-one image
#
# One container runs Foundry VTT, foundry-mcp, and player-portal.
# A wrapper entrypoint starts mcp/portal in the background, then execs
# into felddy's own entrypoint which downloads and launches Foundry.
#
# Build context: monorepo root
#   docker build -f deploy/Dockerfile -t foundry-toolkit:dev .
#
# Three build stages produce the runtime artifacts:
#   build-portal  — Vite SPA + compiled Fastify server (Alpine OK: pure-JS output)
#   build-module  — api-bridge Vite bundle + static assets (Alpine OK: pure-JS output)
#   build-mcp     — foundry-mcp source + workspace deps (Debian: esbuild native binary
#                   must match the runtime glibc in felddy/Debian trixie)
###############################################################################

###############################################################################
# Stage 1 — Build player-portal (Vite SPA + tsc Fastify server)
###############################################################################
FROM node:22-alpine AS build-portal
WORKDIR /repo

# Workspace manifests first — cached until any manifest changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/player-portal/package.json  apps/player-portal/
COPY apps/dm-tool/package.json        apps/dm-tool/
COPY packages/shared/package.json     packages/shared/
COPY packages/pf2e-rules/package.json packages/pf2e-rules/

# --ignore-scripts skips husky and electron-rebuild lifecycle hooks.
RUN npm install --ignore-scripts

COPY packages/shared    packages/shared
COPY packages/pf2e-rules packages/pf2e-rules
COPY apps/player-portal apps/player-portal

RUN npm --workspace @foundry-toolkit/player-portal run build

###############################################################################
# Stage 2 — Build foundry-api-bridge Foundry module
###############################################################################
FROM node:22-alpine AS build-module
WORKDIR /app

COPY apps/foundry-api-bridge/package.json ./
# --legacy-peer-deps: foundry-vtt-types conflicts with the monorepo TypeScript pin.
# git: some transitive deps in the api-bridge tree are fetched via git protocol.
RUN apk add --no-cache git && npm install --legacy-peer-deps --ignore-scripts

COPY apps/foundry-api-bridge/tsconfig.json  ./
COPY apps/foundry-api-bridge/vite.config.ts ./
COPY apps/foundry-api-bridge/src            ./src
# Produces dist/module.js via esbuild-backed Vite bundler.
RUN npx vite build

# Static assets that Vite doesn't generate — checked in under dist/ in the repo.
# The root .dockerignore has a !apps/foundry-api-bridge/dist/ exception so these
# are present in the build context.
COPY apps/foundry-api-bridge/dist/module.json    ./dist/module.json
COPY apps/foundry-api-bridge/dist/styles         ./dist/styles
COPY apps/foundry-api-bridge/dist/templates      ./dist/templates

###############################################################################
# Stage 3 — Prepare foundry-mcp workspace (tsx runtime — no separate build step)
#
# MUST use a glibc-based image (not Alpine/musl) because tsx bundles esbuild,
# which installs a platform-native binary.  felddy/foundryvtt:release is
# Debian trixie (glibc 2.38); node:22-bookworm (glibc 2.36) produces binaries
# that are ABI-compatible with trixie.
#
# @foundry-toolkit/shared exports raw .ts sources; tsx compiles them on the
# fly via esbuild.  A plain `tsc && node dist/` would fail because compiled JS
# still imports the .ts workspace package.  tsx handles this transparently.
###############################################################################
FROM node:22-bookworm AS build-mcp
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/foundry-mcp/package.json apps/foundry-mcp/
COPY apps/dm-tool/package.json     apps/dm-tool/
COPY packages/shared/package.json  packages/shared/

RUN npm install --ignore-scripts

COPY packages/shared  packages/shared
COPY apps/foundry-mcp apps/foundry-mcp

###############################################################################
# Stage 4 — Runtime: felddy/foundryvtt (Debian trixie + Node 24 pre-installed)
###############################################################################
FROM felddy/foundryvtt:release

# ── api-bridge module seed ────────────────────────────────────────────────────
# Baked to /seed instead of /data so a volume-mounted /data doesn't clobber it.
# docker-entrypoint.sh copies it into /data/Data/modules/ on first boot
# (only when the destination doesn't already exist).
COPY --from=build-module /app/dist /seed/modules/foundry-api-bridge

# ── foundry-mcp (tsx on TypeScript source — workspace layout preserved) ───────
# node_modules/@foundry-toolkit/shared → ../../packages/shared symlink intact.
# Node 24 is already at /usr/local/bin/node in the felddy base image.
COPY --from=build-mcp /repo /app/mcp

# ── player-portal (compiled artifacts + hoisted node_modules) ────────────────
# server-dist/index.js uses import.meta.url to resolve ../dist for static files,
# so the layout /app/portal/server-dist/ + /app/portal/dist/ is what it expects.
# All runtime deps are pure JS — no native addons — so Alpine-built node_modules
# are safe to copy into the Debian runtime.
COPY --from=build-portal /repo/apps/player-portal/dist         /app/portal/dist
COPY --from=build-portal /repo/apps/player-portal/server-dist  /app/portal/server-dist
COPY --from=build-portal /repo/apps/player-portal/package.json /app/portal/package.json
COPY --from=build-portal /repo/node_modules                    /app/portal/node_modules

# ── Wrapper entrypoint ────────────────────────────────────────────────────────
# Seeds the api-bridge module, starts mcp/portal in background, then execs
# into felddy's ./entrypoint.sh (which downloads and launches Foundry).
COPY --chmod=755 deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# ── Baked environment defaults ────────────────────────────────────────────────
# All three processes are co-located; no inter-service DNS needed.
# Users supply FOUNDRY_USERNAME, FOUNDRY_PASSWORD, SHARED_SECRET via --env-file.
ENV MCP_URL=http://127.0.0.1:8765 \
    FOUNDRY_URL=http://127.0.0.1:30000 \
    FOUNDRY_DATA_DIR=/data/Data \
    LIVE_DB_PATH=/data/mcp/foundry-mcp.db

# Public ports: 3000 = player-portal (players), 30000 = Foundry (GM direct).
# foundry-mcp (8765) is internal only — do not publish it by default.
EXPOSE 3000 30000

# Override felddy's entrypoint with our wrapper; restore the CMD that felddy
# defines (Docker resets CMD to empty when ENTRYPOINT is overridden).
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["resources/app/main.mjs", "--port=30000", "--headless", "--noupdate", "--dataPath=/data"]
