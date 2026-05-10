import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadRootEnv } from '@foundry-toolkit/shared/env';
import { mockApi } from './mock/api-middleware';

// In dev, Vite serves the SPA on :5173 and proxies to the Fastify server on
// :3000 for:
//   /api/*          — /api/live/* in-process, /api/mcp/* → foundry-mcp
//   /map/*          — → map.pathfinderwiki.com (tile proxy)
//   /icons, /systems, /modules, /worlds — → Foundry VTT
//
// In prod, Fastify serves the built dist/ itself — Vite isn't in the loop.
//
// `envDir` points at the monorepo root so `import.meta.env.VITE_*` reads
// from the single root .env. The Fastify server loads the same file at
// startup via server/load-env.ts.
//
// `vite --mode mock` (npm run dev:mock) swaps the /api and asset proxies
// for an in-process mock plugin that serves src/fixtures/*-prepared.json
// and placeholder images — lets the SPA boot with neither Foundry nor the
// MCP bridge running. Live-sync (/api/live/*) falls through and 404s in
// mock mode; those routes don't have fixtures yet.

loadRootEnv();

const FOUNDRY_ASSET_PREFIXES = ['/icons', '/systems', '/modules', '/worlds'];
const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, 'src', 'fixtures');

export default defineConfig(({ mode }) => {
  const useMock = mode === 'mock';
  return {
    envDir: path.resolve(here, '../..'),
    plugins: [react(), ...(useMock ? [mockApi(fixturesDir)] : [])],
    resolve: {
      alias: {
        // Mirrors tsconfig.json `paths` — '@/...' resolves to src/ regardless
        // of the importer's depth.
        '@': path.resolve(here, 'src'),
        // Allow CSS @import '@foundry-toolkit/shared/tokens/...' to resolve
        // directly to the file system without going through exports-map
        // resolution, which @tailwindcss/postcss's bundler doesn't support
        // for bare package specifiers.
        '@foundry-toolkit/shared/tokens': path.resolve(here, '../../packages/shared/tokens'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    server: {
      port: 5173,
      proxy: useMock
        ? undefined
        : {
            '/api': {
              target: 'http://localhost:3000',
              changeOrigin: true,
              ws: true,
              // Prevent Vite's proxy from timing out long-lived SSE connections.
              proxyTimeout: 0,
              timeout: 0,
            },
            '/map': {
              target: 'http://localhost:3000',
              changeOrigin: true,
            },
            ...Object.fromEntries(
              FOUNDRY_ASSET_PREFIXES.map((prefix) => [
                prefix,
                { target: 'http://localhost:3000', changeOrigin: true },
              ]),
            ),
          },
    },
  };
});
