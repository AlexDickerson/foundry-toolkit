import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
