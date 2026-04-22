# =============================================================================
# foundry-character-creator — static bundle image
#
# Primary purpose: publish the Vite-built SPA at a well-known path
# (/usr/share/nginx/html/) so foundry-mcp's Dockerfile can consume it via
#   COPY --from=ghcr.io/alexdickerson/foundry-character-creator:latest \
#        /usr/share/nginx/html/ /app/public/
# and serve the assets alongside its REST/MCP/WebSocket API via
# @fastify/static in a single Node process on Fly.io.
#
# Secondary use: the nginx runtime stage makes this image runnable on its
# own as a minimal SPA host (useful for one-off static-only deployments
# or local previews). No reverse proxy, no upstream env vars.
# =============================================================================

# -- Build: React SPA (Vite) --
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first so the layer caches on package.json churn only.
COPY package.json package-lock.json ./
RUN npm ci

# Build inputs.
COPY tsconfig.json tsconfig.node.json vite.config.ts postcss.config.js index.html ./
COPY src ./src
# vite.config.ts imports from ./mock, so the build needs it present even
# though the mock plugin is only enabled via `vite --mode mock`.
COPY mock ./mock
RUN npm run build

# -- Runtime: nginx (static only) --
FROM nginx:alpine

# Trivial default config — SPA fallback + /healthz, nothing else.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# The built SPA. foundry-mcp's Dockerfile reaches into this path with
# `COPY --from=...`; do not rename it.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
