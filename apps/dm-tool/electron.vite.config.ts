import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-vite gives us one config with three build targets:
//   - main   : the Electron main process (Node.js, our db/ipc/config code)
//   - preload: the contextBridge shim between main and renderer
//   - renderer: the React app loaded inside the BrowserWindow
//
// Workspace packages (@foundry-toolkit/*) are bundled into main/preload rather
// than externalized — their sources are pure TS with `./foo.js` imports that
// Node's runtime resolver can't handle without a compile step. Bundling lets
// Vite transform them during build.
const workspaceBundled = ['@foundry-toolkit/ai', '@foundry-toolkit/db', '@foundry-toolkit/shared'];

// Native modules pulled in transitively by bundled workspace packages must be
// re-externalized so their `.node` binaries resolve at runtime instead of
// being inlined by Rollup (which breaks the `bindings` loader).
const nativeDeps = ['better-sqlite3'];

// Monorepo root holds the single .env. All three build targets point at it
// so Vite's `import.meta.env.VITE_*` resolution reads the same file. The
// main process also calls loadRootEnv() at startup (via
// @foundry-toolkit/shared/env-auto) for non-VITE-prefixed vars.
const rootEnvDir = resolve(__dirname, '../..');

export default defineConfig({
  main: {
    envDir: rootEnvDir,
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled, include: nativeDeps })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
    envDir: rootEnvDir,
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts'),
        },
      },
    },
  },
  renderer: {
    envDir: rootEnvDir,
    root: __dirname,
    plugins: [react()],
    server: {
      fs: {
        // Hoisted node_modules sits at the workspace root (two levels up
        // from here). Disable strict mode so Vite can serve hoisted
        // assets (pdfjs worker, fonts, etc.) that live outside this
        // package's directory.
        strict: false,
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // Allow CSS @import '@foundry-toolkit/shared/tokens/...' to resolve
        // directly to the file system without going through exports-map
        // resolution, which @tailwindcss/postcss's bundler doesn't support
        // for bare package specifiers.
        '@foundry-toolkit/shared/tokens': resolve(__dirname, '../../packages/shared/tokens'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
});
