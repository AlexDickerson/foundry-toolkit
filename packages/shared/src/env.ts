import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

// Monorepo-wide convention: every app reads env vars from the single
// `.env` at the toolkit root. Per-app `.env` files are not loaded by
// code — they exist only for docker-compose (`--env-file`). This helper
// walks up looking for a toolkit-root package.json with an adjacent
// `.env`. In a git worktree the `.env` is untracked and lives only at
// the main checkout, so we keep walking past the first matching
// package.json until we find one that actually has an `.env` beside it.
// Existing process env wins; the .env only fills in anything missing.
let loaded: string | null | undefined;

export function loadRootEnv(): string | null {
  if (loaded !== undefined) return loaded;
  const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()];
  for (const start of starts) {
    const envPath = findRootEnv(start);
    if (envPath) {
      dotenvConfig({ path: envPath, override: false });
      loaded = envPath;
      return envPath;
    }
  }
  loaded = null;
  return null;
}

function findRootEnv(start: string): string | null {
  let dir = start;
  while (true) {
    if (isToolkitRoot(dir)) {
      const envPath = join(dir, '.env');
      if (existsSync(envPath)) return envPath;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isToolkitRoot(dir: string): boolean {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; workspaces?: unknown };
    return pkg.name === 'foundry-toolkit' && !!pkg.workspaces;
  } catch {
    return false;
  }
}
