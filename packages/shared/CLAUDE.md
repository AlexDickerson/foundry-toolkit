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
- `./foundry-markup` — `src/foundry-markup.ts`
- `./map-stem` — `src/map-stem.ts`
- `./MissionBriefing` — `src/MissionBriefing.tsx` (React component)
- `./golarion-map` — `src/golarion-map/index.ts`

## Key decisions / gotchas

- Peer-deps, not direct deps: consumers (dm-tool via electron-vite, player-portal via Vite) bundle React + maplibre-gl themselves. This package just imports them.
- `./MissionBriefing` is a `.tsx` export — consumers must bundle it. Works fine under Vite / electron-vite; would need a compiler step if anything else consumed it.
- Lives in the root-ESLint scope — root `eslint.config.js` only excludes `packages/*/dist/`, not source.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only.
