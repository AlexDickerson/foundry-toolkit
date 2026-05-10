import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors tsconfig.json `paths` so `@/...` imports resolve in tests.
      '@': path.resolve(here, 'src'),
    },
  },
  test: {
    // Client tests (React components): jsdom + ResizeObserver stub
    // Server tests (Fastify/auth): node environment, no DOM setup needed
    // environmentMatchGlobs uses absolute paths; **/src/** matches any src/ directory.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    environment: 'jsdom', // default; overridden for server/** below
    environmentMatchGlobs: [
      ['**/server/**', 'node'],
    ],
    globals: false,
    setupFiles: ['src/test-setup.ts'],
  },
});
