# @foundry-toolkit/pf2e-rules

Pure PF2e rules math: encounter XP, threat tiers, and treasure-budget lookups. Zero runtime deps, no state, no I/O — any consumer that needs to reason about encounter balance or treasure pacing can depend on it without pulling in the AI or DB layers.

Part of the foundry-toolkit monorepo at `packages/pf2e-rules` — see the root [CLAUDE.md](../../CLAUDE.md).

## Tech stack

- TypeScript (raw — consumers transpile)
- Vitest for unit tests

## Build & run

- `npm run typecheck`
- `npm run test` — vitest

## Project structure

Subpath exports:

- `.` — aggregate (`src/index.ts`)
- `./encounter` — `creatureXp`, `threatLabel`, `budgetMultiplier` (CRB Table 10-1, 10-2)
- `./treasure` — `TREASURE_PER_LEVEL_GP`, `moderatePerEncounterGp`, `encounterTreasureBudgetGp`, `treasureBudgetByThreat` (CRB Table 10-9)

## Key decisions / gotchas

- Source of truth is the PF2e Core Rulebook; tables hard-coded. If CRB revisions change the numbers, edit the table constants — no consumer should be hard-coding copies.
- `creatureXp` caps at PL+5 (200 XP) and floors at PL-5 (0) per the official table, so callers can feed arbitrary creature levels without pre-clamping.
- `budgetMultiplier` has a 0.25 floor so trivial encounters still produce some treasure when a caller scales by multiplier; full-zero would break downstream math.
- `moderatePerEncounterGp` falls back to level 10 for out-of-range party levels — callers don't crash on unexpected input but should prefer clamping upstream.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only.
