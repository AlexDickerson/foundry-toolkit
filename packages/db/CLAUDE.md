# @foundry-toolkit/db

Single data layer for dm-tool's Electron main process. Wraps:

- `pf2e.db` — module functions over the shared SQLite file (settings, inventory, combat, globe pins, Aurus, lazy foundry-mcp document cache). Compendium reads (monsters, items, feats, spells …) moved to foundry-mcp's REST API — see `apps/dm-tool/electron/compendium/`.
- `BookDb` — class that shares the `pf2e.db` connection for the book catalog
- `MapDb` — read-only wrapper around the map-tagger SQLite index

Part of the foundry-toolkit monorepo at `packages/db` — see the root [CLAUDE.md](../../CLAUDE.md).

## Tech stack

- TypeScript (raw — consumers transpile)
- `better-sqlite3` (native module; rebuild handled by the root `postinstall`)

## Build & run

- `npm run typecheck` — no build step; dm-tool's electron-vite consumes raw TS.

## Project structure

Subpath exports map to `src/<name>/index.ts`:

- `.` — aggregate (`src/index.ts`)
- `./pf2e` — state DB (open/close + functional accessors)
- `./books` — `BookDb` class
- `./maps` — `MapDb` (read-only)

## Key decisions / gotchas

- Consumed **only** by dm-tool's Electron main process — never the renderer. If you find yourself importing from the renderer (`src/`), stop and route through IPC instead.
- `better-sqlite3` native rebuild: root `postinstall` covers it; `npm run rebuild-sqlite` is the manual escape hatch.
- `MapDb` is read-only — the `tagger/` Python subtool is the writer of its index.
- `BookDb` shares the `pf2e.db` connection; its constructor runs a `CREATE TABLE` migration for the books table.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only.
