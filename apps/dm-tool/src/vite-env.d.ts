/// <reference types="vite/client" />

import type { ElectronAPI } from '../electron/ipc/types.js';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
