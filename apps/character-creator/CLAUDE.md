# foundry-character-creator

React 19 SPA that renders a Pathfinder 2e character creator/viewer, consuming the foundry-mcp REST API.

Part of the foundry-toolkit monorepo at `apps/character-creator` — see the root [CLAUDE.md](../../CLAUDE.md) for cross-workspace context.

## Tech Stack
- React 19 + Vite 7 (pinned to match dm-tool's electron-vite@5 peer range; bump when electron-vite 6 stable lands)
- TypeScript
- Tailwind CSS 4 (PostCSS)
- Sass (for ported pf2e SCSS)
- Vitest 4 + Testing Library (React) + jsdom
- ESLint 9, Prettier

## Build & Run
- `npm run dev` — Vite on :5173 with HMR, proxies `/api` → :8765 (foundry-mcp), Foundry asset prefixes → :30000
- `npm run dev:mock` — Vite with an in-process mock middleware serving `src/fixtures/*-prepared.json` (no backend required)
- `npm run build` — `tsc --noEmit && vite build` → `dist/`
- `npm run preview` — serve the built `dist/`
- `npm run lint` / `lint:fix`
- `npm run typecheck`
- `npm run test` / `test:watch` — Vitest

Env overrides for dev server targets:
- `FOUNDRY_URL` (default `http://localhost:30000`)
- `MCP_URL` (default `http://localhost:8765`)

## Project Structure
- `src/api/` — typed fetch wrappers for `/api/*`
- `src/i18n/` — vendored `en.json` from pf2e (Apache-2.0) + `t()` resolver
- `src/components/` — React components; tab ports live under `components/tabs/`
- `src/pages/` — Top-level routes/pages
- `src/styles/pf2e/` — ported SCSS from `foundryvtt/pf2e` (Apache-2.0)
- `src/fixtures/` — `*-prepared.json` sample actors used by mock mode and tests
- `src/lib/` — generic helpers
- `mock/api-middleware.ts` — Vite middleware used by `dev:mock`
- `NOTICE` — attribution for pf2e-derived files

## Git Workflow
- All work MUST be done in git worktrees. Never work directly on main.
- Worktree directory: `.claude/worktrees/<branch-name>/` at the monorepo root (not per-app)
- Push work to the remote frequently — at minimum after every logical unit of work, and always before ending a session.
- All changes go through PRs to main. Never commit directly to main.
- Run linting before committing. Fix lint errors before pushing.

## Key Decisions
- HTTP-only runtime contract with foundry-mcp (`/api/*`) — the SPA never reaches into other apps at runtime. Shared *type* imports from `@foundry-toolkit/shared` are fine and preferred (the foundry-mcp wire contract lives in `@foundry-toolkit/shared/foundry-api`).
- PF2e visuals are ported forward from the upstream pf2e system; frontend-side `t()` resolves i18n keys. Upstream license (Apache-2.0) preserved via `NOTICE`.
- Mock mode exists so the SPA can boot with neither Foundry nor foundry-mcp running.
- The user prefers sans-serif by default; serif is opt-in.
