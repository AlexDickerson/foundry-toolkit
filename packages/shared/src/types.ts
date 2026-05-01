// Barrel re-export — keeps all existing `import ... from '@foundry-toolkit/shared'`
// and `import ... from '@foundry-toolkit/shared/types'` working without changes.
//
// New types belong in the appropriate domain file under src/<domain>/types.ts.
// This barrel is preserved for one minor-version cycle; see audit finding F3.

export * from './maps/types.js';
export * from './books/types.js';
export * from './compendium/types.js';
export * from './chat/types.js';
export * from './party/types.js';
export * from './combat/types.js';

// ---------------------------------------------------------------------------
// Config (exposed to renderer for Settings UI / first-run setup)
// Stragglers: only consumed by dm-tool's ElectronAPI and Settings UI.
// ---------------------------------------------------------------------------

/** All config paths surfaced to the renderer. Optional fields use "" when
 *  not configured rather than undefined — simpler for controlled inputs. */
export interface ConfigPaths {
  libraryPath: string;
  indexDbPath: string;
  inboxPath: string;
  quarantinePath: string;
  taggerBinPath: string;
  booksPath: string;
  autoWallBinPath: string;
  foundryMcpUrl: string;
  obsidianVaultPath: string;
  /** Bearer token for foundry-mcp's /api/live/* POST endpoints. Empty =
   *  live-state pushes skip auth (only safe on a trusted local network). */
  sidecarSecret: string;
}

export interface PickPathArgs {
  mode: 'directory' | 'file';
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}
