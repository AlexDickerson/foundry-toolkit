# Refactor Audit — 2026-04-30

## Summary

Workspaces audited: **8** (4 apps, 4 packages). Findings: **17**.

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 6 |
| Medium | 7 |
| Low | 3 |

Three themes dominate. **First**, a long-running migration to a generic Foundry dispatcher (PRs #74, #100, #106) has left tail-end cleanup behind: five typed roll handlers register but no one calls them, and the 499-line `commands/types/base.ts` continues to grow because the typed-handler and dispatcher paths still coexist with no documented "stop adding command types" policy. **Second**, the shared package's contract surface is healthy in spirit but uneven in execution — `packages/shared/src/types.ts` has accreted into a 1080-line god file mixing 10+ unrelated domains, and one of the most-used helpers (`buildCompendiumQuery`) silently drops 16 search params, forcing dm-tool to re-implement filters client-side. **Third**, player-portal's hot React components are accumulating effect-pattern smells: `react-hooks/exhaustive-deps` and `set-state-in-effect` disables are concentrated in a handful of hooks (`usePaginatedSearch`, `useRemoteData`, `useFeatDetail`, `AttributesStep`) that all reimplement the same "stable callback / cancellable fetch" pattern. The user is already iterating on decomposition (#59, #60, #61, #62, #141, #142, #143, #144, #145, #148) — this audit flags the structural pieces that decomposition alone won't fix.

Baseline data: `npm run knip` is clean (only `lint-staged` flagged, false positive — used by Husky). `npm run lint` is clean (2 `no-explicit-any` warnings in dm-tool, no errors). Total source size ~34k LOC.

In-flight branches that overlap with findings are noted per-finding so the user does not double-up.

## Findings (highest-leverage first)

---

### F1: `buildCompendiumQuery` silently drops 16 search params — Severity: **Critical**

**Where:** `packages/shared/src/http.ts:69-82` (the helper); `packages/shared/src/foundry-api.ts:92-166` (the type that lists the missing fields); `packages/shared/src/rpc/schemas.ts:60-115` (the server-side Zod schema that *does* accept them); `apps/dm-tool/electron/compendium/client.ts:52`, `apps/player-portal/src/api/client.ts:71` (both call sites).

**What's wrong:** The helper claims to build the query string for `GET /api/compendium/search` from `CompendiumSearchOptions`, but it only serializes 10 of the 26 fields. Silently dropped: `minLevel`, `rarities`, `sizes`, `creatureTypes`, `usageCategories`, `isMagical`, `hpMin`/`hpMax`, `acMin`/`acMax`, `fortMin`/`fortMax`, `refMin`/`refMax`, `willMin`/`willMax`. The server's Zod schema accepts all of them, and `CompendiumMatch` has the response fields ready (`rarity`, `size`, `creatureType`, `hp`, `ac`, `fort`, `ref`, `will`, `usage`, `isMagical`, `source`). dm-tool already documents the workaround inline: `apps/dm-tool/electron/compendium/prepared.ts:485` reads "Client-side minLevel filter — the wire contract only exposes maxLevel today" — but the wire contract *does* expose it; the *client helper* doesn't. Other facet filters (`rarities`, `creatureTypes`, etc.) are also re-implemented in `prepared.ts:204-224` and `prepared.ts:409-419` against the cached projection.

**Cost:** Direct correctness drag and a real perf cost — every monster-browser facet filter ships the full pack from the server (subject to `limit`) and narrows in JavaScript. Loot generation's `partyLevel ± 2` window is enforced client-side too. Anyone reaching for `isMagical` filtering (likely future work) will hit the same wall and assume the *server* doesn't support it. The helper is the single layer the wire contract was supposed to consolidate; this is the single largest "looks fine, doesn't actually work" surface in the repo.

**Suggested change:** Add the missing 16 cases to `buildCompendiumQuery`. Mirror the encoding rules already used by the Zod schema (CSV for arrays, `.toString()` for numbers, `'true'`/`'false'` for the boolean). Add a vitest unit test in `packages/shared/src/http.test.ts` (currently absent) that round-trips a fully-populated `CompendiumSearchOptions` through `buildCompendiumQuery` → `compendiumSearchQuery.parse()` and asserts every field survives. Once the helper is correct, retire the client-side `minLevel` / facet workarounds in `apps/dm-tool/electron/compendium/prepared.ts` in a follow-up PR.

**Effort estimate:** Small (< half-day).

---

### F2: Five dead roll handlers + their type union entries fully wired — Severity: **High**

**Where:** `apps/foundry-api-bridge/src/main.ts:203-207` (registrations); `apps/foundry-api-bridge/src/commands/handlers/actor/RollAbilityHandler.ts`, `RollSkillHandler.ts`, `RollSaveHandler.ts`, `RollAttackHandler.ts`, `RollDamageHandler.ts` (handler files); `apps/foundry-api-bridge/src/commands/types/base.ts:196-200, 299-303, 401-405` (CommandType / CommandParamsMap / CommandResultMap entries).

**What's wrong:** PR #100 added the generic dispatcher; PR #106 migrated saves/strikes/damage/spell-cast onto the dispatcher + pf2e-rules client. The five typed roll handlers were not removed. A repo-wide grep for `'roll-skill'`, `'roll-ability'`, `'roll-save'`, `'roll-attack'`, `'roll-damage'` finds zero callers in `apps/foundry-mcp`, `apps/dm-tool`, `apps/player-portal`, or `packages/*` — only the registration sites and the CommandType union references themselves. The five handlers, their tests, and their per-command types are dead weight.

**Cost:** Onboarding friction (next person reading `main.ts:203-207` will ask "is this still load-bearing?"); ongoing maintenance — `commands/types/base.ts` keeps re-exporting the related param/result types and gets a 6-line bigger diff every time a domain name moves. Also blocks finding F4 (the right "stop typing every command" policy is hard to articulate while a half-migrated example sits in the file).

**Suggested change:** Delete the five handler files, the five registrations in `main.ts`, the five entries in each of the three maps in `base.ts`, and the related Zod params if any. Run the workspace's Jest suite to confirm no integration tests reach them; if any do, migrate to the dispatcher path or remove. Single-PR cleanup.

**Effort estimate:** Small (< half-day).

---

### F3: `packages/shared/src/types.ts` is a 1080-line god file mixing 10+ unrelated domains — Severity: **High**

**Where:** `packages/shared/src/types.ts` (1080 lines).

**What's wrong:** This file conflates: map-tagger metadata (`MapSummary`, `MapDetail`, `SearchParams`, `Facets`), book catalog (`Book`, `BookClassification`, `BookClassifyProgress`), AI chat constants (`DEFAULT_CHAT_MODEL`), monster browser shapes, item browser shapes, combat tracker types, party inventory types, mission briefing data, the `ConfigPaths` startup contract, and — most awkwardly — the full Electron `ElectronAPI` IPC interface that's only consumed by dm-tool's renderer. It's the canonical entry export of `@foundry-toolkit/shared` (`.` → `./src/types.ts`), so every consumer (dm-tool, player-portal, foundry-mcp) pulls in the whole file's worth of declarations whether or not they use them. Recent churn (11 changes in 2 months) shows it's still being edited as a dumping ground, not maintained as a public contract.

**Cost:** Change amplification. Every cross-app type addition routes through here, even when only one app needs it. The file is the most likely future merge-conflict generator — multiple in-flight branches (chat-relay, party-stash, combat-detail-actions-spells, character-portrait, etc.) all need to add or modify types in shared. Splitting the file lets those branches touch domain-specific subfiles instead of fighting for the same 1080-line file.

**Suggested change:** Split by the same domain pattern already used by `golarion-map/`, `rpc/`, and `tokens/`: create `src/maps/types.ts` (MapSummary/MapDetail/Facets), `src/books/types.ts`, `src/party/types.ts`, `src/chat/types.ts`. Move dm-tool-only types like `ElectronAPI` to `apps/dm-tool/electron/ipc/types.ts` (no consumer outside dm-tool reads it). Keep `src/types.ts` as a thin re-export barrel for backward compatibility through one minor-version cycle, then delete. Add subpath exports per domain in `package.json` so consumers can import narrowly.

**Effort estimate:** Medium (half-day to two days).

---

### F4: `commands/types/base.ts` is a 499-line union/maps file with no documented growth policy — Severity: **High**

**Where:** `apps/foundry-api-bridge/src/commands/types/base.ts` (499 lines).

**What's wrong:** PR #140 split `commands/types.ts` into per-domain files (`actor.ts`, `combat.ts`, `scene.ts`, etc.) — but the **central** `CommandType` union, `CommandParamsMap`, and `CommandResultMap` still live in `base.ts` as one monolith. Every new typed command requires three edits in this file (union, params map, result map). Meanwhile, the generic dispatcher (`'dispatch'` command, `apps/foundry-api-bridge/src/commands/handlers/dispatch/DispatchHandler.ts`, 237 lines) and `'invoke-actor-action'` (per-action registry) cover most new feature work without touching `base.ts`. There's no documented rule for which commands should be typed-at-the-wire vs. dispatcher-routed, so contributors keep adding to `base.ts` defensively. The file's churn (14 changes in 2 months) confirms this.

**Cost:** Onboarding friction — "do I add a typed handler or use the dispatcher?" has no answer in the workspace's CLAUDE.md. Change amplification — every typed command adds 3+ entries here. Future migration cost — once a "stop adding command types" rule exists, the existing 80+ command types will need an audit pass to retire the ones that should have been dispatcher routes.

**Suggested change:** Add a "When to add a typed command vs. dispatcher route" section to `apps/foundry-api-bridge/CLAUDE.md`. Suggested rule: typed commands only for high-frequency, latency-sensitive operations with strict req/resp shapes (the `get-actors` family, the channel subscription handler); dispatcher (`'dispatch'` + pf2e-rules client) for one-off Foundry method calls; `'invoke-actor-action'` for mutations where the registry pattern fits. Then split `base.ts` itself: move `CommandParamsMap` / `CommandResultMap` next to their domain files (each domain `.ts` exports its slice; `base.ts` becomes the union of slices). This is a structural cleanup, not a behavior change.

**Effort estimate:** Medium (one to two days, mostly mechanical refactor + doc).

---

### F5: `InvokeActorActionHandler` doesn't validate per-action params — Severity: **High**

**Where:** `apps/foundry-api-bridge/src/commands/handlers/actor/InvokeActorActionHandler.ts` (the dispatch loop); `apps/foundry-api-bridge/src/commands/handlers/actor/actions/` (per-action handlers); `packages/shared/src/rpc/schemas.ts:35-37` (only validates the *outer* envelope `{ params?: Record<string, unknown> }`).

**What's wrong:** The `invoke-actor-action` command type is the user's recommended path for new mutations (per CLAUDE.md and PRs #44, #48). Inbound HTTP requests are validated against `invokeActorActionBody` at the foundry-mcp layer, but that schema only checks that `params` is `Record<string, unknown>` — every action's specific param shape (`{resource, delta}`, `{statistic, rollMode}`, `{spell, slot}`, etc.) flows through unchecked. The action handlers in `actions/` then do ad-hoc narrowing inline. Some actions have informal Zod-or-manual checks; others trust the caller. Schemas for the action-specific shapes (`adjustActorResourceBody`, `adjustActorConditionBody`, `rollActorStatisticBody`, etc.) already exist in `rpc/schemas.ts` but are not used by the bridge handler — they're applied earlier in the foundry-mcp REST layer for the dedicated routes that pre-date the dispatcher.

**Cost:** Correctness — malformed action params surface deep in handler code (e.g. `actor.increaseCondition(undefined)` rather than a 400 at the boundary). Drift — every new action becomes another opportunity to forget validation. Cross-cutting change — if validation is ever made strict, the absence of per-action schemas in the registry will require a sweep.

**Suggested change:** Add an `ACTION_SCHEMAS: Record<ActionName, z.ZodType>` map alongside the existing `ACTION_HANDLERS` registry. Have `InvokeActorActionHandler` parse `params.params ?? {}` with the matching schema and pass the typed result into the action handler. This makes every action self-validating at the registration site and forces new actions to declare their shape up front.

**Effort estimate:** Medium (half-day to two days, depending on how many existing actions have implicit shape assumptions).

---

### F6: `apps/foundry-mcp/src/bridge.ts` has its own SSE pool that duplicates `ChannelManager` — Severity: **High**

**Where:** `apps/foundry-mcp/src/bridge.ts:23-51` (`pendingBridgeEvents`, `sseSubscribers`, `broadcastSse`); `apps/foundry-mcp/src/events/channel-manager.ts` (the canonical `ChannelManager`).

**What's wrong:** Two independent SSE fan-out implementations live in the same server. `bridge.ts` maintains a `Set<SubscriberFn>` for "bridge events" (pf2e ChoiceSet prompts that need a player to answer) with hand-rolled broadcast + dead-subscriber pruning. `ChannelManager` does the same for hook-driven channels (rolls, chat, combat, actors), with strictly better mechanics — per-channel subscriber sets, 0↔1 transition callbacks, dead-pruning that fires the right transition. Bridge events could be a `'bridge-events'` channel on the existing manager and the ~30 lines of duplicated SSE plumbing would go away.

**Cost:** Maintenance — any improvement to the SSE pattern (backpressure, max-subscriber limits, structured logging on dead-prune) has to be done twice or risks divergence. Conceptual overhead — when a future feature needs a server-pushed event, the choice between "another bridge handler" and "another channel" is undocumented and looks arbitrary.

**Suggested change:** Add a `'bridge-events'` channel to `ChannelManager` (or generalize the manager to accept non-string channel keys). Move `pendingBridgeEvents` book-keeping out of bridge.ts (it's the bookkeeping, not the pub/sub, that's bridge-specific) and have the existing SSE route in `http/routes/` consume the channel like any other. Tests: extend `test/channel-manager.test.ts` to cover the bridge-event semantics (queueing the latest pending events on subscribe).

**Effort estimate:** Medium (one to two days; the test surface is the bigger half).

---

### F7: `react-hooks/exhaustive-deps` + `set-state-in-effect` disables concentrated in player-portal data hooks — Severity: **High**

**Where:** `apps/player-portal/src/lib/usePaginatedSearch.ts:87, 108, 136`; `apps/player-portal/src/lib/useRemoteData.ts:65`; `apps/player-portal/src/components/creator/useFeatDetail.ts:32, 68`; `apps/player-portal/src/components/creator/FeatDetailPanel.tsx:32, 80`; `apps/player-portal/src/routes/CharacterCreator/steps/AttributesStep.tsx:70, 76, 86, 186, 208`; `apps/player-portal/src/routes/CharacterCreator/steps/ClassStep.tsx:64`; `apps/player-portal/src/routes/CharacterCreator/steps/LanguagesStep.tsx:64, 88`; `apps/player-portal/src/routes/CharacterCreator/steps/SkillsStep.tsx:61`; `apps/player-portal/src/components/tabs/Crafting.tsx:486`; `apps/player-portal/src/components/tabs/Progression.tsx:102`.

**What's wrong:** Twelve files carry one or more `// eslint-disable-next-line react-hooks/exhaustive-deps` or `react-hooks/set-state-in-effect` comments around fetch + state-machine effects. The pattern in each is the same: an effect needs to read the latest version of a callback or option object without retriggering when its identity changes; the author's solution is to disable the lint rule and rely on a `ref` snapshot taken inline. This works *most* of the time but trades a lint warning for a stale-closure bug class that's hard to reproduce — when a component re-renders mid-fetch with a new dependency that the disabled effect ignored, the in-flight callback still references stale state. `usePaginatedSearch` and `useRemoteData` independently invent the same generation-counter + `optionsRef` pattern (~20 LOC each).

**Cost:** Correctness — every disable is an opportunity for a stale-closure bug that won't surface until a specific re-render order happens (the kind of bug the lint rule exists to prevent). Change amplification — refactoring one of these effects requires re-deriving the eslint-disable rationale every time. Duplication — the next data hook will copy whichever pattern was nearest.

**Suggested change:** Extract a `useStableCallback(fn)` hook (5 LOC: ref + render-time write + stable wrapper) and a `useCancellableEffect(deps, run)` (the generation-counter + cancel pattern). Migrate `usePaginatedSearch`, `useRemoteData`, `useFeatDetail` to use them. The eslint-disables go away because the deps are honest. New data hooks copy the pattern, not the workaround. Don't try to convert all 12 files in one PR — start with the two most-shared hooks (`usePaginatedSearch`, `useRemoteData`).

**Effort estimate:** Medium (one to two days for the two shared hooks; the per-component disables can be retired incrementally as those files are next touched).

---

### F8: `ApiError` (foundry-api.ts) and `ErrorResponse` (rpc/schemas.ts) are documented duplicates — Severity: **Medium**

**Where:** `packages/shared/src/foundry-api.ts:13-16` (`ApiError`); `packages/shared/src/rpc/index.ts:81-87` (`ErrorResponse`, with the comment "mirrored in `foundry-api.ts` as `ApiError` (same shape)").

**What's wrong:** Both interfaces declare `{ error: string; suggestion?: string }`. The `rpc` index file *names* the duplication in a comment but doesn't enforce it. If anyone adds a field for richer error context (request id, retryability hint, error code) to one without remembering to add it to the other, the wire contract silently splits — and TypeScript won't catch it because no caller imports both names side by side.

**Cost:** Drift risk on a contract that's already small enough to be invisible until it's broken. Trivial to fix; trivially blocks future error-context improvements until fixed.

**Suggested change:** Make `ApiError` the single source. Delete the duplicate interface in `rpc/index.ts` and replace with `export type ErrorResponse = ApiError;`. Inline the comment.

**Effort estimate:** Small (< half-day, mostly grep-and-replace plus typecheck).

---

### F9: `apps/foundry-api-bridge/src/dialog/dialog-intercept.ts` is a 491-line monolith with `any` and `@ts-expect-error` — Severity: **Medium**

**Where:** `apps/foundry-api-bridge/src/dialog/dialog-intercept.ts` (491 lines, 2 `eslint-disable @typescript-eslint/no-explicit-any` comments at lines 54 and 68, plus a `@ts-expect-error` at the top).

**What's wrong:** This file does four things: (a) intercepts Foundry's `Dialog` and `DialogV2` constructors via global monkey-patch, (b) walks the DOM of the resulting dialogs to extract field metadata (input/select/textarea, enum options, defaults), (c) marshals the spec across the WS bridge and waits for a player response, and (d) marshals the response back into the dialog's submit path. The mixing makes the file very hard to test (the spec extractor is pure-ish and could be tested without Foundry; the intercept lifecycle requires Hooks mocks). The `any` casts at lines 54, 68 are doing real load-bearing work — the prompt-intercept module (`apps/foundry-api-bridge/src/creator/prompt-intercept.ts`) has the same pattern, suggesting a shared abstraction is missing.

**Cost:** Adding a new field type (color picker, file input) requires reading the full 491 lines. Test coverage of the spec extractor is gated on mocking everything else. Future Foundry API changes (DialogV3, async dialogs) hit this file at every layer.

**Suggested change:** Extract `dialog-spec-extractor.ts` (pure DOM walk → `DialogSpec`) — fully unit-testable with jsdom, no Foundry mocks needed. Keep `dialog-intercept.ts` for the lifecycle (Hooks + WS marshaling). Apply the same split to `prompt-intercept.ts` if it has the same shape (it does — see line 2's `@ts-expect-error`).

**Effort estimate:** Medium (half-day to one day, mostly mechanical extraction + adding tests for the extractor).

---

### F10: Three independent `let tileOpenCounter = 30` z-index counters in expandable tiles — Severity: **Medium**

**Where:** `apps/player-portal/src/components/tabs/inventory/InventoryItemRow.tsx:12` (GridTile); `apps/player-portal/src/components/tabs/inventory/PartyStash.tsx:50` (StashTile); `apps/player-portal/src/components/tabs/Crafting.tsx` (FormulaCard, around line 157+).

**What's wrong:** Three components implement the "most recently opened tile rises above other tiles" behavior with a module-scoped `let tileOpenCounter = 30` and an `onToggle: () => ++tileOpenCounter` increment. They don't coordinate — opening a stash tile after a grid tile may not put it above the grid tile because each starts at 30. The pattern was clearly copied between files. Any future expandable card (chat message expand, monster browser detail tile, etc.) will copy again.

**Cost:** Low correctness drag (the panes don't overlap visually most of the time), high duplication signal — the same UI pattern is being reinvented per component, and the next expandable will copy from the nearest example. Theme/animation changes require touching three places.

**Suggested change:** Extract `useTileZIndexStack()` in `apps/player-portal/src/lib/`. Returns `[zIndex, onToggle]` from a module-scoped counter. All three components use it; future expandables import it.

**Effort estimate:** Small (< half-day).

---

### F11: Recurring SSE backfill+stream merge pattern in `useLiveChat` — Severity: **Medium**

**Where:** `apps/player-portal/src/lib/useLiveChat.ts` (the whole file, ~135 lines).

**What's wrong:** The hook does: GET a backfill page from `/api/mcp/chat/recent`, open an SSE stream from `/api/mcp/events/chat/stream`, dedupe overlapping messages by id, merge backfill and live messages into one ordered list, manage reconnect state. It's well-written, but it's a *pattern* — the next live feed (party stash deltas, party display rail, combat ticker) will need it again. Right now the only escape valve is "copy useLiveChat and tweak". The dedup uses `arr.some()` (O(n) per insert), which is fine for chat but won't be for high-volume feeds.

**Cost:** Reusability — the next SSE consumer will copy the pattern, miss an edge case (cancellation cleanup, dedup, schema validation), and ship a near-duplicate hook. Compare to the rest of `apps/player-portal/src/lib/` where shared patterns *are* extracted (`useRemoteData`, `usePaginatedSearch`, `useEventChannel`).

**Suggested change:** Extract `useBackfilledStream<T>({ backfillUrl, streamUrl, schema, dedupeKey })`. Implement it once; rewrite `useLiveChat` as a thin wrapper that supplies the chat-specific URL + Zod schema + `id` dedupe. New SSE feeds pick this up immediately.

**Effort estimate:** Medium (half-day to one day; the test surface is the bigger half).

---

### F12: God components remain in player-portal even after recent decomposition — Severity: **Medium**

**Where:** `apps/player-portal/src/components/tabs/Progression.tsx` (837 lines); `apps/player-portal/src/components/tabs/Spells.tsx` (641); `apps/player-portal/src/components/tabs/Crafting.tsx` (541); `apps/dm-tool/src/features/settings/SettingsDialog.tsx` (620); `apps/dm-tool/src/features/book-browser/BookReader.tsx` (600 — already decomposed in PR #62 but the parent is still 600 lines).

**What's wrong:** The user has been actively decomposing god components — Inventory (#145), Character (#142), BookBrowser (#61), BookReader (#62), CharacterCreator (#59, #60), InitiativeTracker (#141), CompendiumPicker (#148). The above five remain. Of these, **Progression.tsx is the highest-risk**: it owns hydrating picks from actor items, pre-fetching every class-feature document in parallel, rendering 20 level rows × 6 slot types, and three picker modals — all in one file. The pre-fetch ref (`featureDocCacheRef`) + `docsVersion` state-bump pattern is fragile, and the 102-line eslint-disabled effect in particular is a candidate for stale-closure bugs.

**Cost:** Change amplification — every addition to character progression touches Progression.tsx. Future merge conflicts are likely concentrated here. The same applies to Spells (one file owns rank grouping, slot tracking, prepared/known logic, cast UI) and SettingsDialog (one file owns every settings section).

**Suggested change:** Mirror the Inventory/Character decomposition pattern. For Progression specifically: extract `useClassFeatureDocCache(classItem)` (pre-fetch hook), `useProgressionPicks(items)` (hydration), and a `<ProgressionPickers>` component that renders all three picker modals based on `pickerTarget`. The parent becomes orchestration only. Apply the same lens to Spells (rank grouping → hook), Crafting (formula resolution → hook), SettingsDialog (per-section components).

**Effort estimate:** Medium per component (half-day to two days each). Don't bundle them.

---

### F13: Foundry global type shims are re-declared in 77 handler files — Severity: **Medium**

**Where:** Every file in `apps/foundry-api-bridge/src/commands/handlers/**/*Handler.ts` has either `declare const game: FoundryGame` or `(globalThis as unknown as { game: FoundryGame }).game`, with `FoundryGame` and friends (`FoundryActor`, `ActorItem`, `ActorItemsCollection`, `ActorsCollection`) re-declared inline per file. Sample at `actor/GetActorHandler.ts:3-30`, `actor/GetPreparedActorHandler.ts:3-37`.

**What's wrong:** Each handler defensively declares the narrow Foundry shapes it uses, instead of importing them from `src/types/foundry.d.ts` (which exists). The shim interfaces have non-trivial overlap (every handler that touches actor items re-declares `ActorItem`). 77 files of repeated boilerplate doesn't carry runtime cost but does carry maintenance cost — when Foundry adds a new property the handlers care about, 5+ files have to change instead of one type module.

**Cost:** Maintenance amplification (low-grade but constant); onboarding friction (the handlers look more complex than they are because the first 30 lines of each file are type-shim).

**Suggested change:** Move the shared event-time read shims (`FoundryActor`, `ActorItem`, `ActorItemsCollection`, `FoundryGame`) into `src/types/foundry-event-shapes.ts`. Have handlers `import type { ... } from '../../types/foundry-event-shapes.js'`. Keep the `declare const game` pattern (it's the right idiom for Foundry's global). Mechanical refactor — no behavior change.

**Effort estimate:** Small to medium (half-day to one day; mostly mechanical, worth doing as a single PR).

---

### F14: `MissionBriefing.tsx` accepts a JSX `actions` slot for dm-tool-only buttons — Severity: **Medium**

**Where:** `packages/shared/src/MissionBriefing.tsx:159-160` (the `actions?: React.ReactNode` prop).

**What's wrong:** The component is documented as "read-only parchment mission briefing for the player-facing globe", and player-portal renders it without the `actions` prop. dm-tool passes its "Link Note" + "Refresh" buttons through the slot. Future dm-tool-only buttons (Share, Confirm, Edit) will keep widening the slot's contract. The shared package thereby grows app-specific UI affordances by accretion.

**Cost:** Boundary erosion — `@foundry-toolkit/shared` is supposed to host code both apps consume. JSX slots are too permissive a contract; the next contributor adds dm-tool styling/behavior and the test suite has no place to catch it.

**Suggested change:** Replace the JSX slot with two callback props: `onLinkNote?: () => void` and `onRefresh?: () => void`, plus optional labels. Render the buttons inside `MissionBriefing` so the look-and-feel stays in shared. dm-tool wires the callbacks to its IPC. If dm-tool needs more controls later, prefer adding more callbacks over re-introducing a JSX slot.

**Effort estimate:** Medium (half-day to one day, including dm-tool wiring update).

---

### F15: `actors` SSE channel doesn't react to party-stash mutations (Inventory uses a `stashNonce` workaround) — Severity: **Low**

**Where:** `apps/player-portal/src/components/tabs/inventory/Inventory.tsx:58` (the `stashNonce` counter); `apps/foundry-api-bridge/src/events/EventChannelController.ts` (the `actors` channel registers for `updateActor` only).

**What's wrong:** When a player transfers an item to the party stash, the bridge updates the *party actor*, but the `actors` event channel filter doesn't auto-deliver an event the Inventory tab can use to refresh. The portal works around this by maintaining a local `stashNonce` that gets bumped on transfer success and forces re-fetch. It works, but it leaks an event-system gap into the UI.

**Cost:** Tight coupling between mutator paths and observer paths; future mutations to the stash (item removal, container moves) will need their own nonce bumps or duplicate fetches.

**Suggested change:** Either (a) extend the `actors` channel filter so updates to party-actor `system.party.*` paths fire, or (b) add a dedicated `party-stash` channel. Option (b) is more invasive but cleaner — the stash has no other live data shape (the party display rail already runs on its own snapshot).

**Effort estimate:** Small (< half-day for option a; medium for option b).

---

### F16: `env-auto.ts` and `env.ts` are exposed as public subpath exports but used only internally — Severity: **Low**

**Where:** `packages/shared/package.json:11-12` (the `./env` and `./env-auto` exports); `packages/shared/src/env.ts` (53 lines); `packages/shared/src/env-auto.ts` (8 lines, side-effect import that calls `loadRootEnv()`).

**What's wrong:** Both files exist to load the root `.env` file in dm-tool's main process and foundry-mcp's server. They're exposed via subpath exports as if they're a public capability — but they're not really shared, they're a monorepo convention. New consumers seeing two env exports have to read the source to understand which one to use (the side-effect import vs. the function). This is public-surface noise.

**Cost:** Low (it works); cognitive overhead for new consumers; blocks future "different consumers want different env strategies" without restructuring the public surface.

**Suggested change:** Either drop the subpath exports and let consumers reach in (the convention is a monorepo-internal thing), or keep them but document in `packages/shared/CLAUDE.md` that `env-auto` is the "monorepo convention" entry point and bare `env` is for consumers that want explicit control.

**Effort estimate:** Small (< half-day).

---

### F17: `lint-staged` flagged unused by knip (false positive) — Severity: **Low**

**Where:** `package.json:42` (devDependencies); `.husky/pre-commit` or similar (the actual consumer).

**What's wrong:** `npm run knip` reports `lint-staged` as unused. It's almost certainly used by the pre-commit hook installed via Husky (the file isn't an npm "entry" so knip can't see it). Listing it as unused on every audit run is noise.

**Cost:** Trivial (a recurring false positive in audit output).

**Suggested change:** Add `lint-staged` to `knip.json`'s `ignoreDependencies` with a comment explaining the pre-commit-hook reason.

**Effort estimate:** Trivial (~5 min).

---

## Recommended next 3

These are the three findings that, weighted by impact-per-day-of-effort, return the most.

1. **F1 (`buildCompendiumQuery` silently drops 16 query params).** This is a confirmed correctness bug with a concrete client-side workaround already documented in the source (`prepared.ts:485`). It directly affects monster browser facets and loot generation. The fix is a single file (`packages/shared/src/http.ts`) plus a round-trip test. Half-day of work removes a class of "the filter UI looks like it works, but the data isn't actually filtered server-side" bugs. After the helper is fixed, dm-tool's client-side facet workarounds become deletable in a separate small PR.

2. **F2 (delete dead roll handlers).** The cleanest cleanup in the audit. Five handlers, five registrations, fifteen lines of `base.ts` map entries — all confirmed dead (no caller anywhere in `apps/`, `packages/`). Less than half a day of mechanical deletion plus a test run. The reason this ranks above larger refactors: it's a precondition for F4 (writing the "stop adding command types" rule). The half-migrated example sitting in `base.ts` makes it harder to argue for the policy. Removing dead code first; writing the policy second.

3. **F3 (split `packages/shared/src/types.ts`).** Highest leverage among the structural items. The file is the single biggest merge-conflict generator across in-flight branches (chat-relay, party-stash, combat-detail-actions-spells all need to add or modify shared types). Splitting it by domain — using the same pattern already established by `golarion-map/`, `rpc/`, `tokens/` — costs a focused day. After the split, future cross-app contract changes touch domain-specific subfiles, not a 1080-line god file. This unblocks the user's existing decomposition cadence; without it, `types.ts` keeps growing and every domain split inside `apps/player-portal` has to reach back into the shared package's god file.

The next tier (F5, F6, F7) is also worth attention but each carries more design risk than the top three.

---

## Process notes

- This audit reflects the merged-on-`main` state at commit `1cc51be` (refactor-audit branch). In-flight worktrees were intentionally not read.
- Findings cross-checked against branch list (`git worktree list`): no in-flight branch was identified that already addresses any finding above. (The recently-merged decomposition PRs #59–#62, #140–#145, #148 *did* address adjacent god-component concerns; F12 names what remains.)
- `npm run knip` reports clean (modulo F17).
- `npm run lint` reports clean (2 `no-explicit-any` warnings in dm-tool, no errors).
- Tests were not exercised — the audit examined source, not behavior.
