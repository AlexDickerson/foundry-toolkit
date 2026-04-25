# foundry-toolkit

Monorepo consolidating four Foundry VTT companion tools. npm-workspaces, no Turborepo/Nx/pnpm. See [README.md](./README.md) for the layout tree and top-level scripts.

## Tech stack

- TypeScript 6, shared strict config in `tsconfig.base.json` (ES2022, Bundler moduleResolution, `noUnusedLocals` / `noUnusedParameters` on).
- ESLint 10 flat config (`eslint.config.js`), `typescript-eslint`, `eslint-config-prettier`.
- Prettier 3 (`.prettierrc`): 120-col, `trailingComma: all`, `singleQuote: true`, `semi: true`.
- `@electron/rebuild` at root; `apps/dm-tool` owns the `better-sqlite3` rebuild via its own `postinstall`.
- ESM throughout (`"type": "module"` at root).

## Workspaces

- `apps/*` — four apps (dm-tool, foundry-mcp, foundry-api-bridge, player-portal).
- `packages/*` — four internal libs (ai, db, pf2e-rules, shared).
- `tools/launcher` — small Electron GUI to spawn dev:\* per worktree. (npm workspace, no shared-code deps.)
- `tagger/` — Python map-indexing subtool. Built separately. **NOT an npm workspace.**
- `auto-wall-bin/` — Prebuilt binary. **NOT an npm workspace.** Referenced as `extraResources` by dm-tool's electron-builder.

Internal dependency graph:

- `shared` + `pf2e-rules` → `ai` → `db` → `dm-tool`
- `shared` → `player-portal` (includes the PF2e character creator/sheet surface; uses `@foundry-toolkit/shared/foundry-api` + `@foundry-toolkit/shared/rpc` for the MCP wire contract).
- `shared` → `foundry-mcp` (wire contract types + Zod schemas).
- `foundry-api-bridge` is standalone (no workspace deps).

Stay inside one workspace's surface unless the task explicitly spans them. When you do span, edit `shared` first, then consumers.

Every workspace has its own `CLAUDE.md` covering app-specific details.

## Commands (root)

- `npm install` — installs all workspaces; `apps/dm-tool`'s own `postinstall` rebuilds `better-sqlite3` against Electron's ABI. Other workspaces don't pay that cost.
- `npm run rebuild-sqlite` — manual escape hatch if the native module ever gets out of sync.
- `npm run dev:dm-tool` / `dev:mcp` / `dev:player-portal` / `dev:player-portal:mock` / `dev:api-bridge` — each targets one workspace.
- `npm run typecheck` / `test` / `build` / `format` / `format:check` — fan out via `--workspaces --if-present`.
- `npm run lint` — runs the root ESLint pass **and** each workspace's own lint script.
- `npm run lint:fix` — auto-fix lint errors where possible.
- `npm run knip` — detect unused files and dependencies.
- `npm run launcher` — opens `tools/launcher` (Electron GUI to spawn dev:\* per worktree).

## Testing

Most workspaces use **Vitest 4** (`packages/shared`, `packages/pf2e-rules`, `apps/dm-tool`, `apps/player-portal`). The one exception is `apps/foundry-api-bridge`, which uses **Jest** because it's a forked Foundry VTT module with existing Jest tests — keep using Jest there, don't try to harmonize.

Tests are colocated next to the source file as `*.test.ts` / `*.test.tsx`, and run per-workspace with `npm run test`. Root-level `npm run test` fans out across all workspaces with `--if-present`.

**Your work must include tests** at a reasonable level of coverage:

- **New features** ship with tests covering non-trivial logic — pure functions, reducers, parsers, rules engines, data-layer behavior, protocol / RPC shaping. Skip pixel-testing UI components unless their behavior is non-trivial.
- **Bug fixes** ship with a regression test that fails without the fix and passes with it.
- **Refactors** preserve the existing test surface — update tests to match the new shape rather than deleting them.

Before committing, run the target workspace's tests (`npm run test -w <workspace>` or `cd <workspace> && npm test`). Confirm they pass.

If a workspace lacks a test setup and your work genuinely needs one, bootstrap with **Vitest** (match the 4.x version in the other workspaces) — unless you're working in `foundry-api-bridge`, where Jest is the established choice.

## Logging

Logging you add is part of the feature — it **ships into `main` and stays there**. It should answer "what is this code doing right now?" for an operator (future you, six months from now) without a debugger attached. **Throwaway `console.log` you added to chase a current bug is _not_ this kind of logging — strip those before opening the PR.**

What good logging looks like:

- **Use levels.** `error` for failures, `warn` for recoverable surprises, `info` for state changes worth knowing, `debug` for finer traces. If the workspace has a structured logger (foundry-mcp, player-portal Fastify server), use its level methods. If it's plain `console`, use `console.error` / `.warn` / `.info` / `.debug` rather than dumping everything at `.log`.
- **Log at boundaries, not in loops.** RPC into foundry-mcp, db queries, asset fetches, AI tool calls, Foundry hook firings, sheet/application lifecycle. Not per-render-tick.
- **Lines must be self-contained.** Include identifying context — actor id, pack id, request id, compendium key — so a single log line is useful on its own.
- **Errors include cause.** Pass the actual `Error`, not just a message. Stacks matter.
- **No throwaway noise.** "Here", "got x", "starting", "done" without context don't pass the bar. If you wouldn't want to read this six months from now, don't ship it.
- **Never log**: `.env` values, `OPENAI_API_KEY`, Foundry credentials, full chat prompts, full asset payloads, anything else that leaks secrets or balloons log volume.

**Format**: match the existing logger / `console` pattern in the workspace you're working in. Don't introduce a logger library that isn't already in the workspace.

## /api/eval — dev escape hatch

`apps/foundry-mcp` exposes `POST /api/eval` when started with `ALLOW_EVAL=1` (set in the root `.env`, copied into worktrees by the orchestrator). It accepts `{ script: string }`, runs the script in an async IIFE inside Foundry's page (via `apps/foundry-api-bridge/src/commands/handlers/RunScriptHandler.ts`), and returns the result.

**Reach for it during investigation** — when you need to know what a Foundry / PF2e API call returns without hand-writing a typed handler first. Common cases: discovering document shapes, listing skill / save slugs, validating that a method exists and behaves as expected before formalizing it. Sample requests live in `apps/foundry-mcp/_http/rest-api.http`. Faster than building a handler, observing it, then deleting it.

**Don't ship code that depends on `/api/eval` at runtime.** It's an investigation tool. Productionize discoveries by writing a real handler (or, when issue #74's generic dispatcher lands, routing through that). When `ALLOW_EVAL` is unset the endpoint isn't registered and requests 404 indistinguishably from any other unknown route — production code calling it would fail silently.

## API documentation lookups (Context7)

Context7 is the preferred tool for fetching up-to-date docs on libraries, frameworks, and APIs. The MCP exposes `mcp__context7__resolve-library-id` and `mcp__context7__query-docs`. Reach for it instead of guessing from training data.

**Foundry VTT API** (hooks, Document model, classes, application lifecycle):

- `/websites/foundryvtt_api_v14` — v14 API (current).
- `/websites/foundryvtt_api_v13` — v13 API.
- `/foundryvtt/foundryvtt` — generic Foundry docs.

**PF2e system** (rules, sheet behaviors, common system shapes):

- `/kagangtuya-star/foundry-pf2e-wiki-doc` — community PF2e wiki / docs (high reputation, 710 snippets).

**When Context7 isn't enough:** typed source-level questions (exact public method signatures on `CharacterPF2e`, `ItemPF2e`, etc.) aren't fully indexed there. Read the vendored PF2e source under `apps/player-portal/`, or do a direct read against `https://github.com/foundryvtt/pf2e`. Gemini Pro / NotebookLM handles the full repo size if needed — but stay inside Claude Code unless the size genuinely requires it.

**Relationship to `/api/eval`:** Context7 is for documented API — static descriptions, method signatures, hook names. `/api/eval` is for runtime introspection — when you need to know what a real actor's data looks like right now, eval beats both Context7 and source reads.

## Root ESLint scope

`eslint.config.js` explicitly ignores `apps/player-portal`, `apps/foundry-mcp`, `apps/foundry-api-bridge`, plus all `dist/`, `out/`, `server-dist/`, `tagger/`, `resources/`, and `.claude/`. The root ESLint pass therefore only covers **`apps/dm-tool` + `packages/*` + `tools/*`**. The three excluded apps lint via their own workspace scripts.

`packages/*` deliberately do not declare their own `lint` scripts — they rely entirely on the root ESLint pass. Adding workspace-local lint scripts would re-lint the same files in CI.

`knip.json` has explicit per-workspace entries for every workspace, including `packages/*`. Running `npm run knip` covers the full tree.

If monorepo CI ever flags lint in ported/vendored code (pf2e SCSS in player-portal, forked Foundry module), scope CI — don't edit the source files.

## Lint workflow

Lint in this monorepo is slow — TypeScript-aware rules type-check across workspaces. **Don't run lint multiple times to discover errors. Run it once, read the full output, plan all fixes from that.**

- **First step is `npm run lint:fix`** (or workspace-local). Autofix usually clears half or more of the errors with no judgement involved. Re-run lint after; deal with what's left.
- **Read the full output once.** Don't tail / grep / `Select-String` before reading — you lose the `file:line` context and have to re-run to recover it. Pipe to a file or read whole. Lint output is structured, not noise; treat it that way.
- **For drilling into a single file**, run `eslint <file>` directly instead of `npm run lint -w <workspace>`. The npm + workspace orchestration adds 2–4× overhead per invocation, which adds up fast across iterations.
- **`--format compact`** gives one line per error with no decorations — easier to scan and process. `--format json` is best when you want the output as data.
- `npm run format:check` is separate and fast; don't conflate it with lint.

## Git workflow

- All work MUST happen in a git worktree rooted at `.claude/worktrees/<branch-name>/` (monorepo root, **not** per-app).
- Never work directly on `main`; PR-only.
- **Don't create a new branch or worktree until your current PR has been confirmed merged.** Pushing the branch and opening a PR doesn't end the responsibility — it's yours until it lands on `main`. CI failures, review feedback, and follow-up commits go to the **same branch** as new commits. Only after the PR is merged (visible on `main`, branch deleted) should a new branch / worktree be started. If the user redirects you to different work before merge, **ask** before creating a new branch — they may want commits on the existing one.
- Push frequently — at minimum after every logical unit of work, and always before ending a session.
- Run `npm run lint` + `npm run format:check` before committing; fix warnings before pushing.
- Commit only when explicitly asked.
- **PR descriptions must declare which apps were touched.** List the affected apps and their dev commands near the top so the reviewer knows what to spin up in the worktree. Example:

  **Apps touched**
  - `apps/dm-tool` — `npm run dev:dm-tool`
  - `apps/foundry-mcp` — `npm run dev:mcp`

  If only `packages/*` changed, name which app(s) consume the changed package so the reviewer can pick a representative one to validate. If no app needs to be spun up (pure docs / config / CI), say so explicitly.

## Key gotchas

- `tagger/` is a Python subtool with its own build system; `auto-wall-bin/` holds a prebuilt binary. Neither is an npm workspace — don't try to npm-build them. `apps/dm-tool`'s electron-builder config references `../../tagger/dist/map-tagger.exe` and `../../auto-wall-bin/Auto-Wall.exe` as `extraResources` — both must exist at packaging time.
- `.env` at the monorepo root holds Foundry credentials, `OPENAI_API_KEY`, and `ALLOW_EVAL`. Never commit it.
- A minimal lint/typecheck/test/knip pipeline runs in `.github/workflows/ci.yml` plus a dependency-review check. Per-app deployment workflows (Docker publish, Fly deploy) from the pre-consolidation repos were **not** ported. Per-app Dockerfile and fly.toml references still point at the pre-consolidation GHCR repos. Re-point when productionizing.
- The old SPA → MCP rebuild cascade is gone: the character creator now lives inside `player-portal`'s own Fastify server, which proxies `/api/mcp/*` → `foundry-mcp`. `foundry-mcp` no longer bundles an SPA.

## How to start a task

1. Confirm you're in a worktree under `.claude/worktrees/<branch>/` (create one if not).
2. Read the relevant workspace's `CLAUDE.md`.
3. Use the dependency graph to figure out blast radius before editing `shared`, `pf2e-rules`, `ai`, or `db`.
4. Run `npm run typecheck` early; `npm run lint` + `format:check` before committing.
5. Push after each logical unit of work.
