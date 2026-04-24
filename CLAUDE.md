# foundry-toolkit

Monorepo consolidating four Foundry VTT companion tools. npm-workspaces, no Turborepo/Nx/pnpm. See [README.md](./README.md) for the layout tree and top-level scripts.

## Tech stack

- TypeScript 6, shared strict config in `tsconfig.base.json` (ES2022, Bundler moduleResolution, `noUnusedLocals` / `noUnusedParameters` on).
- ESLint 10 flat config (`eslint.config.js`), `typescript-eslint`, `eslint-config-prettier`.
- Prettier 3 (`.prettierrc`): 120-col, `trailingComma: all`, `singleQuote: true`, `semi: true`.
- `@electron/rebuild` at root; `apps/dm-tool` owns the `better-sqlite3` rebuild via its own `postinstall`.

## Workspaces

- `apps/*` — four apps (dm-tool, foundry-mcp, foundry-api-bridge, player-portal).
- `packages/*` — four internal libs (ai, db, pf2e-rules, shared).

Internal dependency graph:

- `shared` + `pf2e-rules` → `ai` → `db` → `dm-tool`
- `shared` → `player-portal` (includes the PF2e character creator/sheet surface; uses `@foundry-toolkit/shared/foundry-api` + `@foundry-toolkit/shared/rpc` for the MCP wire contract).
- `shared` → `foundry-mcp` (wire contract types + Zod schemas).
- `foundry-api-bridge` is standalone (no workspace deps).

Every workspace has its own `CLAUDE.md` covering app-specific details.

## Commands (root)

- `npm install` — installs all workspaces; `apps/dm-tool`'s own `postinstall` rebuilds `better-sqlite3` against Electron's ABI. Other workspaces don't pay that cost.
- `npm run rebuild-sqlite` — manual escape hatch if the native module ever gets out of sync.
- `npm run dev:dm-tool` / `dev:mcp` / `dev:player-portal` / `dev:player-portal:mock` / `dev:api-bridge` — each targets one workspace.
- `npm run typecheck` / `test` / `build` / `format` / `format:check` — fan out via `--workspaces --if-present`.
- `npm run lint` — runs the root ESLint pass **and** each workspace's own lint script.

## Root ESLint scope

`eslint.config.js` explicitly ignores `apps/player-portal`, `apps/foundry-mcp`, `apps/foundry-api-bridge`, plus all `dist/`, `out/`, `server-dist/`, `tagger/`, `resources/`, and `.claude/`. The root ESLint pass therefore only covers **`apps/dm-tool` + `packages/*` + `tools/*`**. The three excluded apps lint via their own workspace scripts.

`packages/*` deliberately do not declare their own `lint` scripts — they rely entirely on the root ESLint pass. Adding workspace-local lint scripts would re-lint the same files in CI.

`knip.json` has explicit per-workspace entries for every workspace, including `packages/*`. Running `npm run knip` covers the full tree.

If monorepo CI ever flags lint in ported/vendored code (pf2e SCSS in player-portal, forked Foundry module), scope CI — don't edit the source files.

## Git workflow

- All work MUST happen in a git worktree rooted at `.claude/worktrees/<branch-name>/` (monorepo root, **not** per-app).
- Never work directly on `main`; PR-only.
- Push frequently — at minimum after every logical unit of work, and always before ending a session.
- Run `npm run lint` + `npm run format:check` before committing; fix warnings before pushing.

## Key gotchas

- `tagger/` is a Python subtool with its own build system; `auto-wall-bin/` holds a prebuilt binary. Neither is an npm workspace. `apps/dm-tool`'s electron-builder config references `../../tagger/dist/map-tagger.exe` and `../../auto-wall-bin/Auto-Wall.exe` as `extraResources` — both must exist at packaging time.
- `.env` at the monorepo root holds Foundry credentials, `OPENAI_API_KEY`, and `ALLOW_EVAL`. Never commit it.
- A minimal lint/typecheck/test/knip pipeline runs in `.github/workflows/ci.yml` plus a dependency-review check. Per-app deployment workflows (Docker publish, Fly deploy) from the pre-consolidation repos were **not** ported. Per-app Dockerfile and fly.toml references still point at the pre-consolidation GHCR repos. Re-point when productionizing.
- The old SPA → MCP rebuild cascade is gone: the character creator now lives inside `player-portal`'s own Fastify server, which proxies `/api/mcp/*` → `foundry-mcp`. `foundry-mcp` no longer bundles an SPA.
