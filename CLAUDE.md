# foundry-toolkit

Monorepo consolidating five Foundry VTT companion tools. npm-workspaces, no Turborepo/Nx/pnpm. See [README.md](./README.md) for the layout tree and top-level scripts.

## Tech stack

- TypeScript 6, shared strict config in `tsconfig.base.json` (ES2022, Bundler moduleResolution, `noUnusedLocals` / `noUnusedParameters` on).
- ESLint 10 flat config (`eslint.config.js`), `typescript-eslint`, `eslint-config-prettier`.
- Prettier 3 (`.prettierrc`): 120-col, `trailingComma: all`, `singleQuote: true`, `semi: true`.
- `@electron/rebuild` at root for `better-sqlite3` postinstall.

## Workspaces

- `apps/*` — five apps (dm-tool, foundry-mcp, foundry-api-bridge, character-creator, player-portal).
- `packages/*` — three internal libs (ai, db, shared).

Internal dependency graph:

- `shared` → `ai` → `db` → `dm-tool`
- `shared` → `player-portal`
- `foundry-mcp`, `foundry-api-bridge`, `character-creator` are standalone (no workspace deps).

Every workspace has its own `CLAUDE.md` covering app-specific details.

## Commands (root)

- `npm install` — installs all workspaces; `postinstall` rebuilds `better-sqlite3` for Electron's ABI.
- `npm run rebuild-sqlite` — manual escape hatch if the native module ever gets out of sync.
- `npm run dev:dm-tool` / `dev:mcp` / `dev:character-creator` / `dev:player-portal` / `dev:api-bridge` — each targets one workspace.
- `npm run typecheck` / `test` / `build` / `format` / `format:check` — fan out via `--workspaces --if-present`.
- `npm run lint` — runs the root ESLint pass **and** each workspace's own lint script.

## Root ESLint scope

`eslint.config.js` explicitly ignores `apps/player-portal`, `apps/foundry-mcp`, `apps/foundry-api-bridge`, `apps/character-creator`, plus all `dist/`, `out/`, `server-dist/`, `tagger/`, `resources/`, and `.claude/`. The root ESLint pass therefore only covers **`apps/dm-tool` + `packages/*`**. The four excluded apps lint via their own workspace scripts.

If monorepo CI ever flags lint in ported/vendored code (pf2e SCSS, forked Foundry module), scope CI — don't edit the source files.

## Git workflow

- All work MUST happen in a git worktree rooted at `.claude/worktrees/<branch-name>/` (monorepo root, **not** per-app).
- Never work directly on `main`; PR-only.
- Push frequently — at minimum after every logical unit of work, and always before ending a session.
- Run `npm run lint` + `npm run format:check` before committing; fix warnings before pushing.

## Key gotchas

- `tagger/` is a Python subtool with its own build system; `auto-wall-bin/` holds a prebuilt binary. Neither is an npm workspace. `apps/dm-tool`'s electron-builder config references `../../tagger/dist/map-tagger.exe` and `../../auto-wall-bin/Auto-Wall.exe` as `extraResources` — both must exist at packaging time.
- `.env` at the monorepo root holds Foundry credentials, `OPENAI_API_KEY`, and `ALLOW_EVAL`. Never commit it.
- Deployments (Fly.io for `foundry-mcp`, electron-builder for `dm-tool`, GHCR images for `foundry-api-bridge` and `character-creator`) and CI workflows were **deferred** during consolidation — per-app Dockerfile and fly.toml references still point at the pre-consolidation GHCR repos. Re-point when productionizing.
- The SPA → MCP rebuild cascade is manual right now: merges to `character-creator` don't auto-rebuild the `foundry-mcp` Docker image that bundles it. Trigger `gh workflow run Docker` on `foundry-mcp` after SPA merges if you need the live app updated.
