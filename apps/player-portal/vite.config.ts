import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

// In dev, Vite serves the SPA on :5173 and proxies API + map-tile traffic
// to the Fastify server on :3000. In prod, Fastify serves the built
// dist/ itself — Vite isn't in the loop.
//
// `envDir` points at the monorepo root so `import.meta.env.VITE_*` reads
// from the single root .env. The Fastify server loads the same file at
// startup via server/load-env.ts.
export default defineConfig({
  envDir: path.resolve(here, '../..'),
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/map': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
