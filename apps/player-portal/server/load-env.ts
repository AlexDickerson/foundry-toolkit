// Side-effect module: loads the monorepo root `.env` into `process.env`
// before any sibling import reads it. Imported first in server/index.ts.
//
// Inlined rather than pulling from @foundry-toolkit/shared so the server's
// runtime footprint stays at Fastify + node_modules deps — shared is a
// devDependency here (client bundles it, server only uses its types).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

// Walk up from two plausible starting points (this file's location and
// cwd). At each toolkit-root package.json, check for a sibling `.env` —
// worktree checkouts share their parent's `.env` so we can't stop at the
// first matching package.json.
const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()];
for (const start of starts) {
  const envPath = findRootEnv(start);
  if (envPath) {
    dotenvConfig({ path: envPath, override: false });
    break;
  }
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
