# =============================================================================
# foundry-api-bridge — Foundry VTT + module image
# Chains Foundry VTT (felddy) with the API bridge module baked in.
# The MCP server runs separately; point its FOUNDRY_WS_URL at this container.
# =============================================================================

# -- Build: Foundry module --
FROM node:20-alpine AS build-module
WORKDIR /app
# npm install (not npm ci) because this workspace lives in the
# foundry-toolkit monorepo — the lockfile is at the root, not here.
# .npmrc carries legacy-peer-deps=true for foundry-vtt-types.
# git is required: at least one transitive dep resolves from a git URL
# (npm ci used to skip git lookups by using tarball URLs in the
# lockfile, but we can't use npm ci without a sibling lockfile).
RUN apk add --no-cache git
COPY package.json .npmrc ./
RUN npm install
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npx vite build

# Copy the static dist assets that aren't produced by vite
COPY dist/module.json ./dist/module.json
COPY dist/styles ./dist/styles
COPY dist/templates ./dist/templates

# -- Production: layer onto felddy/foundryvtt --
FROM felddy/foundryvtt:14

# Module staged for install on first boot
COPY --from=build-module /app/dist /opt/foundry-api-bridge

# Entrypoint wrapper (--chmod avoids needing root for RUN chmod)
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV FOUNDRY_DATA_DIR=/data/Data

EXPOSE 30000

ENTRYPOINT ["docker-entrypoint.sh"]
# Restore the CMD that felddy's entrypoint expects — our ENTRYPOINT
# override resets it to empty, causing "$1: unbound variable".
CMD ["resources/app/main.js", "--port=30000", "--headless", "--noupdate", "--dataPath=/data"]
