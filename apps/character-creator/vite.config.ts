import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mockApi } from './mock/api-middleware';

// Dev server at :5173.
//   /api/*         → foundry-mcp bridge on :8765 (our REST surface)
//   /icons, /systems, /modules, /worlds, /assets
//                  → Foundry VTT on :30000 (character portraits, item
//                    icons, system and module assets). The prepared-actor
//                    payload returns relative paths like
//                    "systems/pf2e/icons/iconics/portraits/amiri.webp" and
//                    "icons/weapons/swords/sword-guard.webp" that Foundry
//                    serves directly from its static tree.
//
// FOUNDRY_URL / MCP_URL env vars let you point at a remote Foundry /
// bridge (e.g. a LAN server) instead of localhost. Production serves the
// built dist/ and is expected to sit behind a reverse proxy that handles
// the same path prefixes.
//
// `vite --mode mock` (npm run dev:mock) swaps the proxy for an in-process
// mock that serves src/fixtures/*-prepared.json — lets the SPA boot with
// neither Foundry nor the MCP bridge running.
const FOUNDRY_URL = process.env['FOUNDRY_URL'] ?? 'http://localhost:30000';
const MCP_URL = process.env['MCP_URL'] ?? 'http://localhost:8765';

const FOUNDRY_ASSET_PREFIXES = ['/icons', '/systems', '/modules', '/worlds', '/assets'];

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, 'src', 'fixtures');

export default defineConfig(({ mode }) => {
  const useMock = mode === 'mock';
  return {
    plugins: [react(), ...(useMock ? [mockApi(fixturesDir)] : [])],
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    server: {
      port: 5173,
      // In mock mode the middleware answers /api/* and the Foundry asset
      // paths inline, so no upstream proxy is needed.
      proxy: useMock
        ? undefined
        : {
            '/api': {
              target: MCP_URL,
              changeOrigin: false,
            },
            ...Object.fromEntries(
              FOUNDRY_ASSET_PREFIXES.map((prefix) => [prefix, { target: FOUNDRY_URL, changeOrigin: false }]),
            ),
          },
    },
  };
});
