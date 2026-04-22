/// <reference types="vite/client" />

import type { ElectronAPI } from '@foundry-toolkit/shared/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
