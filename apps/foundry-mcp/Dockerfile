# =============================================================================
# foundry-mcp — server image
# Stage 1: compile TypeScript in a build image with dev deps.
# Stage 2: slim runtime image with the compiled server + production deps only.
# =============================================================================

# -- Build: compile TypeScript --
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first (cached layer if lockfiles unchanged).
COPY package.json package-lock.json* .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev deps so we can copy just the production install across to runtime.
# `--omit=dev` reads the already-installed tree and prunes it in place.
RUN npm prune --omit=dev


# -- Runtime: node 20 alpine with compiled JS + production node_modules --
FROM node:20-alpine AS runtime

WORKDIR /app

# Unprivileged user (the base image already ships `node:node` uid/gid 1000).
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Compiled server + production dependency tree.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# wget is in busybox — used by the Docker HEALTHCHECK below.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- --tries=1 http://127.0.0.1:${PORT}/healthz || exit 1

USER node

CMD ["node", "dist/index.js"]
