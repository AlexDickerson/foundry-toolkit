# @foundry-toolkit/shared

Types and shared UI components used across dm-tool and player-portal.

Part of the foundry-toolkit monorepo at `packages/shared` — see the root [CLAUDE.md](../../CLAUDE.md).

## Tech stack

- TypeScript (raw — consumers transpile)
- `peerDependencies`: `react >=19`, `maplibre-gl >=5` — consumers provide them.
- `@iconify-json/game-icons` for glyph sets.

## Build & run

- `npm run typecheck`
- `npm run test` — vitest

## Project structure

Subpath exports:

- `.` / `./types` — `src/types.ts`
- `./foundry-api` — `src/foundry-api.ts` (foundry-mcp `/api/*` wire contract: `CompendiumMatch`, `ActorRef`, `PreparedActor`, `ApiError`, etc.)
- `./foundry-markup` — `src/foundry-markup.ts`
- `./map-stem` — `src/map-stem.ts`
- `./MissionBriefing` — `src/MissionBriefing.tsx` (React component)
- `./golarion-map` — `src/golarion-map/index.ts`
- `./rpc` — `src/rpc/index.ts` (Zod schemas + `z.infer<>` types for the `/api/*` request surface; re-used by both `apps/foundry-mcp` server and `apps/character-creator` client)

## Key decisions / gotchas

- Peer-deps, not direct deps: consumers (dm-tool via electron-vite, player-portal via Vite) bundle React + maplibre-gl themselves. This package just imports them.
- `./MissionBriefing` is a `.tsx` export — consumers must bundle it. Works fine under Vite / electron-vite; would need a compiler step if anything else consumed it.
- Lives in the root-ESLint scope — root `eslint.config.js` only excludes `packages/*/dist/`, not source.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only.
