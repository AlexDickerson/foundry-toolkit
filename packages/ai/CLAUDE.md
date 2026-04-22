# @foundry-toolkit/ai

PF2e GM assistant agents — chat, book classifier, encounter-hook generator, loot generator. Pure TS library. No Electron, no SQLite, deliberately portable.

Part of the foundry-toolkit monorepo at `packages/ai` — see the root [CLAUDE.md](../../CLAUDE.md).

## Tech stack

- TypeScript (raw — consumers transpile)
- Vercel AI SDK **v6** + `@ai-sdk/anthropic` v3
- Zod v4 for tool/arg schemas

## Build & run

- `npm run typecheck` — no build step; consumers (dm-tool's electron-vite) handle transpilation.
- `npm run harness` — `tsx harness/run.ts`; local eval harness for iterating on agents offline.

## Project structure

Subpath exports map to `src/<name>/index.ts`:

- `.` — aggregate (`src/index.ts`)
- `./chat` — two-pass chat agent (drafter + adversarial reviewer) with AoN + community tool calls
- `./classifier` — book classifier
- `./hooks` — encounter-hook generator
- `./loot` — loot generator

## Key decisions / gotchas

- **AI SDK v6** is a major bump from v4/v5 — message shapes and tool-call return types differ. If you port code from an older AI-SDK project, expect to rewrite the stream/tool-result plumbing.
- Consumed by `@foundry-toolkit/db` (type imports only) and `apps/dm-tool` (runtime). No Electron coupling — keeps the door open for lifting this package into its own repo with an eval harness later.
- Chat agent uses an adversarial-review pattern (second pass critiques the first) — see `src/chat/`.

## Git workflow

Worktrees at the monorepo root `.claude/worktrees/<branch-name>/`, PR-only.
