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
const workspaceBundled = [
  '@foundry-toolkit/ai',
  '@foundry-toolkit/db',
  '@foundry-toolkit/shared',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceBundled })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
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
