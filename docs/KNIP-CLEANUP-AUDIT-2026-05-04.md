# Knip cleanup audit — 2026-05-04

## Summary

- **Total findings**: 265 (64 unused exports + 201 unused exported types)
- **By category** (post-resolution): DELETE **167**, PUBLIC 59, F13 34, JUDGMENT **0**, SCRIPT-USED 5
- **Original audit categorization**: DELETE 150, PUBLIC 59, F13 34, JUDGMENT 17, SCRIPT-USED 5 — see Resolutions section below for the 17 items that moved JUDGMENT → DELETE.
- **By workspace**:
  | Workspace | Exports | Types | Total |
  |-----------|---------|-------|-------|
  | apps/dm-tool | 30 | 28 | 58 |
  | apps/player-portal | 21 | 40 | 61 |
  | apps/foundry-api-bridge | 12 | 122 | 134 |
  | apps/foundry-mcp | 1 | 10 | 11 |
  | packages/ai | 0 | 1 | 1 |

- **Knip configuration hints** (22 "redundant entry" warnings for packages/ai, packages/db, packages/shared, packages/pf2e-rules): not code findings; address in a separate config-tightening PR.
- **Extra finding**: `lint-staged` in root `package.json:42` flagged as unused devDependency — DELETE in the cleanup PR if confirmed unused.

---

## Resolutions (2026-05-04)

The original audit raised 4 questions covering 17 JUDGMENT items. All resolved by grep-based investigation across `apps/` and `packages/`. **All 17 items move JUDGMENT → DELETE.** Evidence summarized below; cleanup PRs should treat them as standard DELETE-bucket items.

### Q1 — dm-tool `electron/compendium/index.ts` barrel (10 types) → DELETE

The barrel re-exports `ApiError`, `CompendiumDocument`, `CompendiumMatch`, `CompendiumSearchOptions`, `CompendiumSource`, `ItemPrice`, plus a default type alias. Repo-wide grep:

- `grep -rn "from ['\"].*electron/compendium['\"]" apps packages` → zero matches.

No consumers of the barrel anywhere. Safe to delete the barrel and the unused type re-exports. Direct imports from `electron/compendium/types.js` and `electron/compendium/client.ts` continue to work.

### Q2 — api-bridge `KNOWN_ACTIONS` re-export chain (2 exports) → DELETE

Repo-wide grep for `KNOWN_ACTIONS`:

- The only consumer is `InvokeActorActionHandler.test.ts`, which imports directly from `../InvokeActorActionHandler`.
- Re-exports in `commands/handlers/index.ts` and `commands/handlers/actor/index.ts` have no consumers.
- The two `from './actor'` references in `commands/types/base.ts` and `commands/types/index.ts` point at `commands/types/actor`, **not** `commands/handlers/actor`. Different barrel.

The handler-side barrels are dead. Delete the `KNOWN_ACTIONS` re-exports from both files; if those barrels become empty, delete the barrel files too.

### Q3 — foundry-mcp `compendium-cache.ts` re-exports (4 types) → DELETE

`CompendiumCacheStats`, `EnrichedMatch`, `SearchOptions`, `ItemPrice` are defined in `apps/foundry-mcp/src/http/compendium-types.ts`. Other consumers (e.g. `compendium-search.ts:30`) import them directly from `compendium-types.js`. The re-exports in `compendium-cache.ts` (lines 27–42) have no callers — only the file's own internal usage references them, and that usage works directly through the source `compendium-types.ts` after deletion.

### Q4 — `packages/ai` `AnthropicCallInput` (1 type) → DELETE

All three callers of `callAnthropic()` use inline object literals (`callAnthropic({ ... })`) and never annotate the parameter type explicitly:

- `packages/ai/src/classifier/index.ts:41`
- `packages/ai/src/hooks/index.ts:48`
- `packages/ai/src/loot/index.ts:196`

The exported interface is unused as a type annotation. Delete the `export` (the interface stays as an internal type for the function signature) or inline it.

---

## Cleanup plan

### F13 (audit reference): expected dissolution

All 34 F13 items will dissolve when the Foundry-shim extraction lands: see audit **F13** in REFACTOR-AUDIT-2026-04-30.md. The fix is to extract the common shim interfaces to `apps/foundry-api-bridge/src/types/foundry-event-shapes.ts` and have each handler `*Types.ts` file import from there. Do **not** delete these individually.

**F13 type findings** — `export` keyword across handler type files:

`game` re-export (`actorTypes.ts:100`) — global Foundry shim re-export; part of shim infrastructure.

Duplicated across `actorTypes.ts`, `shared.ts`, `itemTypes.ts`, `effectTypes.ts`, `tableTypes.ts`, `combatTypes.ts`, `tokenTypes.ts`, `worldTypes.ts`, `journalTypes.ts`, `actor/actions/types.ts`:

- **FoundryGame** (9 separate definitions — the core F13 target)
- **FoundryActor** (4 definitions: actorTypes, itemTypes, effectTypes as EffectFoundryActor, actions/types)
- **FoundryItem** (3: actorTypes, itemTypes, actions/types)
- **ActorsCollection** (4: actorTypes, itemTypes, effectTypes as EffectActorsCollection, actions/types)
- **FoundryItemsCollection** (2: actorTypes, itemTypes)
- **FoundryDiceTerm** (3: actorTypes, itemTypes, shared.ts)
- **FoundryDamageRoll** (2: actorTypes, shared.ts)
- **RollDialogConfig** (2: actorTypes, shared.ts)
- **RollMessageConfig** (2: actorTypes, shared.ts)
- **FoundryD20Roll** (shared.ts — canonical form also in actorTypes)
- **FoundryPack** (actorTypes, worldTypes)
- **PacksCollection** (actorTypes — companion to FoundryPack)
- **FoundryScene** (sceneTypes, tokenTypes — different minimal shapes)
- **FoundryScenesCollection** (sceneTypes, tokenTypes)
- **FoundryToken** (sceneTypes, tokenTypes — different structures; will unify under F13)
- **FoundryRoll** (itemTypes, tableTypes — different shapes; F13 will produce a superset)
- **ItemFoundryGame** (itemTypes — specialized FoundryGame for item handler)
- **EffectFoundryActor** (effectTypes — specialized FoundryActor for effect handler)
- **EffectActorsCollection** (effectTypes — variant)
- **EffectFoundryGame** (effectTypes — variant)

---

### Workspace: apps/dm-tool

#### DELETE (25 exports, 8 types = 33 findings)

**Exports:**

- `apps/dm-tool/electron/config.ts:203` `bootstrapConfigWritePath` — no references anywhere in project
- `apps/dm-tool/electron/compendium/prepared.ts:542` `itemDocToLootShortlistItem` — prepared.ts re-exports this but nobody imports it from prepared.ts; original in `projection/item.ts` is fine
- `apps/dm-tool/electron/compendium/projection/item.ts:41` `formatPriceStructured` — used internally in item.ts but not imported from outside; barrel re-export also unused
- `apps/dm-tool/electron/compendium/projection/monster.ts:140` `formatRanged` — same pattern; used internally; barrel re-export also unused
- `apps/dm-tool/electron/book-scanner.ts:79` `classifyPath` — no references anywhere
- `apps/dm-tool/electron/book-scanner.ts:110` `normalizeTitle` — no references anywhere
- `apps/dm-tool/electron/constants.ts:13` `AON_BASE_URL` — no references anywhere
- `apps/dm-tool/electron/util.ts:30` `truncate` — no references in dm-tool (a different `truncate` exists in packages/ai/src/shared/text.ts)
- `apps/dm-tool/electron/compendium/projection/index.ts:5` `cleanDescription` — barrel re-export; nobody imports via barrel (originals imported directly from submodules)
- `apps/dm-tool/electron/compendium/projection/index.ts:7` `formatMelee` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:8` `formatRanged` — barrel re-export; same (also: original in monster.ts is also unused)
- `apps/dm-tool/electron/compendium/projection/index.ts:9` `formatActions` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:10` `formatImmunities` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:11` `formatWeaknesses` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:12` `formatSpeed` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:13` `monsterSpells` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:17` `monsterDocToSummary` — barrel re-export; same
- `apps/dm-tool/electron/compendium/projection/index.ts:23` `formatPriceStructured` — barrel re-export; and original in item.ts is also unused
- `apps/dm-tool/electron/compendium/projection/index.ts:25` `itemDocToBrowserRow` — barrel re-export; nobody imports via barrel
- `apps/dm-tool/src/components/ui/dialog.tsx:87` `DialogPortal` — used only within dialog.tsx; no external consumer
- `apps/dm-tool/src/components/ui/dialog.tsx:88` `DialogOverlay` — used only within dialog.tsx
- `apps/dm-tool/src/components/ui/dialog.tsx:90` `DialogClose` — used only within dialog.tsx
- `apps/dm-tool/src/components/ui/button.tsx:45` `buttonVariants` — used only within button.tsx
- `apps/dm-tool/src/components/ui/scroll-area.tsx:37` `ScrollBar` — used only within scroll-area.tsx
- `apps/dm-tool/src/features/book-browser/BookBrowser/sidebar.tsx:42` `NavGroup` — used only within sidebar.tsx

**Types:**

- `apps/dm-tool/electron/foundry-mcp-client.ts:157` `FolderDocumentType` — used in function signatures within the file; remove export
- `apps/dm-tool/electron/foundry-mcp-client.ts:168` `FolderResult` — used within the file; remove export
- `apps/dm-tool/electron/compendium/prepared.ts:100` `PreparedCompendiumOptions` — function parameter type used within file; remove export
- `apps/dm-tool/electron/compendium/singleton.ts:40` `InitPreparedCompendiumOptions` — internal init config type; remove export
- `apps/dm-tool/src/features/book-browser/ap-merge.ts:7` `ApPartInfo` — return type of internal `parseApPart()`; used in same file; remove export
- `apps/dm-tool/src/features/combat/spell-slot-display.ts:8` `SlotDisplayKind` — return type of `slotDisplayKind()`; used within file; remove export
- `apps/dm-tool/src/features/settings/SettingsDialog.tsx:34` `SettingsDialogProps` — component props used only within the same component; remove export
- `apps/dm-tool/src/hooks/usePreferences.ts:23` `Preferences` — hook return type; used within file; remove export

#### PUBLIC (10 types)

Suggest: add `ignoreExportsUsedInFile: true` in knip workspace config for these files, or annotate via per-symbol knip ignore.

- `apps/dm-tool/electron/config.ts:113` `BootstrapConfig` — return type of `loadBootstrapConfig()`; consumed in electron/main.ts via type import; intentional IPC bootstrap contract
- `apps/dm-tool/src/features/monsters/monster-art.ts:1` `MonsterArtAssets` — return type of exported `resolveMonsterArtAssets()`; used in test and in MonsterDetailPane.tsx
- `apps/dm-tool/src/components/ui/input.tsx:4` `InputProps` — shadcn/ui component prop type; intentionally exported for consumers that pass props programmatically
- `apps/dm-tool/src/components/ui/button.tsx:32` `ButtonProps` — shadcn/ui component prop type; same
- `apps/dm-tool/src/components/ui/progress.tsx:4` `ProgressProps` — shadcn/ui component prop type; same
- `apps/dm-tool/electron/tagger.ts:16` `TaggerOptions` — IPC contract type; used in preload and IPC handlers across electron boundary
- `apps/dm-tool/electron/tagger.ts:24` `TaggerProgress` — IPC contract type; same
- `apps/dm-tool/electron/tagger.ts:29` `TaggerResult` — IPC contract type; same
- `apps/dm-tool/electron/foundry-push.ts:32` `PushSceneOptions` — IPC contract type; used in ipc/foundry.ts
- `apps/dm-tool/electron/foundry-push.ts:46` `PushSceneResult` — IPC contract type; same

#### SCRIPT-USED (5 exports)

These are used in test files (`electron/**/*.test.ts`). Knip's dm-tool config lists no test entry points, so tests aren't in the dependency graph. Suggest: add `"electron/**/*.test.ts"` to dm-tool `entry` in `knip.json`, which would clear these automatically.

- `apps/dm-tool/electron/compendium/singleton.ts:24` `MONSTER_PACK_IDS_SETTING` — used internally and in `singleton.test.ts`
- `apps/dm-tool/electron/compendium/singleton.ts:118` `refreshAvailableActorPacks` — used in `singleton.test.ts`
- `apps/dm-tool/electron/compendium/singleton.ts:134` `getAvailableActorPacks` — used in `singleton.test.ts`
- `apps/dm-tool/electron/compendium/singleton.ts:139` `resetAvailableActorPacks` — used in `singleton.test.ts`
- `apps/dm-tool/electron/compendium/singleton.ts:193` `resetPreparedCompendium` — used in `singleton.test.ts`

#### JUDGMENT (10 types)

The dm-tool `compendium/index.ts` appears to be a barrel re-exporting types from `./types.js` which in turn re-exports from `@foundry-toolkit/shared/foundry-api`. It's unclear if these re-exports are still needed.

**Question for each**: Is this re-export still consumed? Check if any file imports this type from `compendium/index.ts` rather than from `@foundry-toolkit/shared` directly.

- `apps/dm-tool/electron/foundry-mcp-client.ts:15` `ActorResult` — re-exported from `@foundry-toolkit/shared/foundry-api`; is this backwards-compat re-export still consumed?
- `apps/dm-tool/electron/compendium/index.ts:38` `CreateCompendiumApiOptions` — is the compendium HTTP API barrel in compendium/index.ts still an active interface?
- `apps/dm-tool/electron/compendium/index.ts:110` `default` — unusual unnamed default type export; likely an accident from a re-export refactor
- `apps/dm-tool/electron/compendium/index.ts:113` `ApiError` — type re-export chain; needed?
- `apps/dm-tool/electron/compendium/index.ts:114` `CompendiumDocument` — type re-export chain; needed?
- `apps/dm-tool/electron/compendium/index.ts:115` `CompendiumMatch` — type re-export chain; needed?
- `apps/dm-tool/electron/compendium/index.ts:117` `CompendiumSearchOptions` — type re-export chain; needed?
- `apps/dm-tool/electron/compendium/index.ts:118` `CompendiumSource` — type re-export chain; needed?
- `apps/dm-tool/electron/compendium/index.ts:119` `ItemPrice` — type re-export chain; needed?
- `apps/dm-tool/electron/compendium/types.ts:7` `ApiError` — appears to be a duplicate of the ApiError re-exported via index.ts; is this file itself still needed?

---

### Workspace: apps/player-portal

#### DELETE (21 exports, 17 types = 38 findings)

**Exports:**

- `apps/player-portal/server/auth/users.ts:59` `getUsers` — no references anywhere in project
- `apps/player-portal/src/lib/coins.ts:10` `COIN_DENOMS` — used internally in coins.ts; no external consumer; remove export
- `apps/player-portal/src/lib/coins.ts:79` `coinDenomOf` — used internally; remove export
- `apps/player-portal/src/prereqs/evaluator.ts:22` `evaluatePredicate` — used internally; re-exported via prereqs/index.ts (which is also unused from outside)
- `apps/player-portal/src/lib/pf2e-maps.ts:10` `RANK_LABEL` — no references; a local duplicate named `RANK_LABEL` exists inside `SkillIncreasePicker.tsx`
- `apps/player-portal/src/prereqs/index.ts:2` `parsePrerequisite` — re-export; prereqs/index.ts barrel is only used internally within the file; no external import found
- `apps/player-portal/src/prereqs/index.ts:3` `evaluateAll` — re-export; same
- `apps/player-portal/src/prereqs/index.ts:3` `evaluatePredicate` — re-export; same
- `apps/player-portal/src/components/Layout.tsx:12` `useLayoutContext` — no references anywhere
- `apps/player-portal/src/components/creator/feat-prefetch.ts:54` `resolvePrereqsForDoc` — used internally within feat-prefetch.ts; no external consumer; remove export
- `apps/player-portal/src/components/creator/FeatMatchRow.tsx:79` `FeatMatchRow` — FeatPicker.tsx imports `{ FeatMatchList }` from this file, not `{ FeatMatchRow }`; FeatMatchRow is a dead named export
- `apps/player-portal/src/components/shop/useFitPageSize.ts:13` `FALLBACK_PAGE_SIZE` — used internally; remove export
- `apps/player-portal/src/components/shop/shop-utils.ts:36` `QUALITY_ORDER` — used internally; remove export
- `apps/player-portal/src/components/shop/shop-utils.ts:66` `QUALITY_WORD_RE` — used internally; remove export
- `apps/player-portal/src/components/shop/shop-utils.ts:81` `variantRank` — used internally; remove export
- `apps/player-portal/src/routes/CharacterCreator/helpers.ts:95` `featLocationFor` — used internally; remove export
- `apps/player-portal/src/routes/CharacterCreator/helpers.ts:101` `previousItemIdFor` — used internally; remove export
- `apps/player-portal/src/components/settings/SettingsDialog.tsx:297` `toAbsoluteUrl` — used internally; remove export
- `apps/player-portal/src/components/tabs/inventory/inventory-shop.ts:109` `applyCoinChanges` — used internally; remove export
- `apps/player-portal/src/components/tabs/inventory/InventoryItemRow.tsx:102` `ContainerChildRow` — used internally within InventoryItemRow.tsx; remove export
- `apps/player-portal/src/components/tabs/inventory/InventoryItemRow.tsx:247` `ItemDescription` — used internally; remove export

**Types:**

- `apps/player-portal/server/auth/users.ts:16` `PublicUser` — return type of `toPublic()` within the file; no external consumer; remove export
- `apps/player-portal/src/lib/live.ts:10` `LiveState` — generic hook state type; used within file; remove export
- `apps/player-portal/src/lib/useExpandableCard.ts:3` `ExpandableCardHandle` — hook return type; used within file; remove export
- `apps/player-portal/src/lib/useLiveChat.ts:16` `LiveChatState` — hook state type; used within file; remove export
- `apps/player-portal/src/lib/usePaginatedSearch.ts:19` `PaginatedState` — used within file; remove export
- `apps/player-portal/src/lib/usePaginatedSearch.ts:24` `UsePaginatedSearchOptions` — function parameter type; used within file; remove export
- `apps/player-portal/src/lib/usePaginatedSearch.ts:33` `UsePaginatedSearchResult` — function return type; used within file; remove export
- `apps/player-portal/src/lib/useParty.ts:7` `UsePartyResult` — hook return type; used within file; remove export
- `apps/player-portal/src/api/client.ts:54` `LongRestResponse` — API response type; used within client.ts; remove export
- `apps/player-portal/src/lib/useShopMode.ts:9` `ShopModeState` — hook state type; used within file; remove export
- `apps/player-portal/src/lib/useUuidHover.tsx:39` `UseUuidHoverOptions` — function parameter type; used within file; remove export
- `apps/player-portal/src/prereqs/index.ts:4` `Predicate` — re-export; same barrel as above; remove
- `apps/player-portal/src/lib/useActorAction.ts:11` `ConfirmingState` — hook state type; used within file; remove export
- `apps/player-portal/src/components/creator/FeatFilters.tsx:7` `SortDir` — local type; used within file; remove export
- `apps/player-portal/src/lib/useRemoteData.ts:16` `UseRemoteDataOptions` — function parameter type; used within file; remove export
- `apps/player-portal/src/lib/usePendingPrompts.ts:7` `PendingPromptPayload` — SSE payload type; used within file; remove export
- `apps/player-portal/src/components/creator/feat-bio.ts:3` `DetailBio` — function return type; used within file; remove export

#### PUBLIC (23 types)

These are wire-contract types for the PF2e API response shapes. They document the Foundry data structure and belong in `src/api/types/` as documented API. Annotate with `ignoreExportsUsedInFile` in knip config for the `src/api/types/` directory.

- `apps/player-portal/src/api/types/index.ts:12` `ApiError` — re-export from `@foundry-toolkit/shared`; intentional wire-contract barrel
- `apps/player-portal/src/components/tabs/Proficiencies.tsx:169` `_ReexportForTsCheck` — intentional re-export to satisfy TypeScript unused-import checking; add to knip `ignoreExports` for this file
- `apps/player-portal/src/api/types/primitives.ts:3` `ModifierKind` — PF2e wire-contract type
- `apps/player-portal/src/api/types/biography.ts:1` `BiographyVisibility` — PF2e wire-contract type
- `apps/player-portal/src/api/types/movement.ts:1` `Speed` — PF2e wire-contract type
- `apps/player-portal/src/api/types/strikes.ts:1` `StrikeVariant` — PF2e wire-contract type
- `apps/player-portal/src/api/types/strikes.ts:5` `StrikeTrait` — PF2e wire-contract type
- `apps/player-portal/src/api/types/strikes.ts:11` `StrikeItemSource` — PF2e wire-contract type
- `apps/player-portal/src/api/types/feats.ts:8` `FeatItemSystem` — PF2e wire-contract type
- `apps/player-portal/src/api/types/actions.ts:3` `ActionKind` — PF2e wire-contract type
- `apps/player-portal/src/api/types/actions.ts:5` `ActionItemSystem` — PF2e wire-contract type
- `apps/player-portal/src/api/types/class.ts:17` `ClassItemSystem` — PF2e wire-contract type
- `apps/player-portal/src/api/types/items.ts:3` `CarryType` — PF2e wire-contract type
- `apps/player-portal/src/api/types/items.ts:5` `ItemEquipped` — PF2e wire-contract type
- `apps/player-portal/src/api/types/items.ts:12` `ItemBulk` — PF2e wire-contract type
- `apps/player-portal/src/api/types/items.ts:24` `PhysicalItemSystem` — PF2e wire-contract type
- `apps/player-portal/src/api/types/spells.ts:5` `SpellPreparationMode` — PF2e wire-contract type
- `apps/player-portal/src/api/types/spells.ts:6` `SpellTradition` — PF2e wire-contract type
- `apps/player-portal/src/api/types/spells.ts:8` `SpellcastingEntrySlot` — PF2e wire-contract type
- `apps/player-portal/src/api/types/spells.ts:14` `SpellcastingEntryItemSystem` — PF2e wire-contract type
- `apps/player-portal/src/api/types/spells.ts:36` `SpellHeightening` — PF2e wire-contract type
- `apps/player-portal/src/api/types/spells.ts:48` `SpellItemSystem` — PF2e wire-contract type
- `apps/player-portal/src/api/types/character.ts:10` `CharacterTraits` — PF2e wire-contract type

---

### Workspace: apps/foundry-mcp

#### DELETE (1 export, 6 types = 7 findings)

**Export:**

- `apps/foundry-mcp/src/http/routes/assets.ts:15` `ASSET_PREFIXES` — used internally in the route registration loop (line 152); remove export

**Types:**

- `apps/foundry-mcp/src/logger.ts:3` `LogEntry` — used internally in logger buffer; remove export
- `apps/foundry-mcp/src/http/asset-cache.ts:15` `AssetCacheEntry` — internal cache data structure; used within file; remove export
- `apps/foundry-mcp/src/http/asset-cache.ts:24` `AssetCacheStats` — internal stats shape; used within file; remove export
- `apps/foundry-mcp/src/http/routes/assets.ts:33` `AssetRouteDeps` — dependency-injection parameter type for `registerAssetRoutes()`; used within file; remove export
- `apps/foundry-mcp/src/events/channel-manager.ts:3` `SubscriberFn` — event callback type; used within file; remove export
- `apps/foundry-mcp/src/events/channel-manager.ts:5` `SubscriptionChangeCallback` — event callback type; used within file; remove export

#### JUDGMENT (4 types)

These four are re-exports in `compendium-cache.ts`. The agent notes they are re-exported "for backwards compatibility." If no file imports them from this path, they are dead.

**Question**: Does anything import `CompendiumCacheStats`, `EnrichedMatch`, `ItemPrice`, or `SearchOptions` from `foundry-mcp/src/http/compendium-cache.ts` specifically? If not, delete these re-exports.

- `apps/foundry-mcp/src/http/compendium-cache.ts:38` `CompendiumCacheStats`
- `apps/foundry-mcp/src/http/compendium-cache.ts:40` `EnrichedMatch`
- `apps/foundry-mcp/src/http/compendium-cache.ts:41` `ItemPrice`
- `apps/foundry-mcp/src/http/compendium-cache.ts:42` `SearchOptions`

---

### Workspace: apps/foundry-api-bridge

#### DELETE (9 exports, 63 types = 72 findings)

**Exports:**

- `apps/foundry-api-bridge/src/dialog/dialog-intercept.ts:226` `resolveFoundryDialog` — only called from within dialog-intercept.ts (lines 157, 209); remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:153` `pixelToGrid` — called within sceneTypes.ts itself at line 233; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:161` `mapNoteToResult` — called within sceneTypes.ts at line 278; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:171` `mapWallToResult` — called within sceneTypes.ts at line 279; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:180` `mapLightToResult` — called within sceneTypes.ts at line 280; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:193` `mapTileToResult` — called within sceneTypes.ts at line 281; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:206` `mapDrawingToResult` — called within sceneTypes.ts at line 282; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:223` `mapRegionToResult` — called within sceneTypes.ts at line 283; remove export
- `apps/foundry-api-bridge/src/commands/handlers/scene/sceneTypes.ts:232` `mapTokenToSummary` — called within sceneTypes.ts at line 285; remove export

**Types — handler-local shims (remove export keyword; type definitions stay):**

From `src/commands/handlers/item/itemTypes.ts`:

- `:17` `ActivityConsumeConfig`
- `:31` `ActivityDialogConfig`
- `:35` `ActivityMessageConfig`
- `:50` `FoundryActivitiesCollection`
- `:56` `FoundryItemSystem`
- `:68` `FoundryChatMessage`
- `:110` `FoundryCanvasTokensLayer`
- `:114` `FoundryCanvasScene`
- `:118` `FoundryCanvas`
- `:123` `FoundryUser`
- `:128` `FoundryModule`
- `:132` `FoundryModulesCollection`
- `:136` `MidiWorkflowToken`
- `:150` `FoundryHooks`
- `:177` `AbilityTemplateDocument`
- `:182` `AbilityTemplateInstance`
- `:187` `AbilityTemplateClass`
- `:192` `Dnd5eCanvas`

From `src/commands/handlers/effect/effectTypes.ts`:

- `:3` `FoundryEffectChange`
- `:10` `FoundryEffectDuration`
- `:20` `FoundryActiveEffect`
- `:35` `FoundryEffectsCollection`

From `src/commands/handlers/table/tableTypes.ts`:

- `:16` `FoundryTableResultsCollection`
- `:46` `FoundryRollTableConstructor`
- `:50` `FoundryTablesCollection`

From `src/commands/handlers/world/worldTypes.ts`:

- `:1` `FoundryWorld`
- `:6` `FoundrySystem`
- `:18` `FoundryPackIndex`
- `:28` `FoundryCollection`
- `:50` `FoundryCompendiumDocument`
- `:56` `FoundryCompendiumPack`

From `src/commands/handlers/combat/combatTypes.ts`:

- `:9` `FoundryCombatant`
- `:21` `FoundryCombatantsCollection`
- `:32` `FoundryCombat`
- `:70` `FoundryCombatsCollection`

From `src/commands/handlers/token/tokenTypes.ts`:

- `:42` `TokenUpdateOptions`
- `:46` `FoundryTokensCollection`

From `src/commands/handlers/scene/sceneTypes.ts`:

- `:13` `FoundryNote`
- `:21` `FoundryWall`
- `:29` `FoundryGrid`
- `:36` `FoundryLight`
- `:51` `FoundryTile`
- `:62` `FoundryDrawing`
- `:74` `FoundryRegionShape`
- `:78` `FoundryRegion`

From `src/commands/handlers/journal/journalTypes.ts`:

- `:3` `FoundryJournalPage`
- `:17` `FoundryPagesCollection`
- `:22` `FoundryJournalEntry`
- `:56` `FoundryJournalCollection`

From `src/commands/handlers/actor/actions/types.ts`:

- `:34` `Pf2eStatistic`
- `:42` `Pf2eStrikeVariant`
- `:60` `FoundryItemCollection`
- `:68` `PF2eActionFn`
- `:78` `FoundryGlobals`
- `:94` `Pf2eSpellcasting`
- `:98` `Pf2eSpellcastingEntry`

From `src/commands/handlers/FetchAssetHandler.ts`:

- `:13` `FetchAssetParams`
- `:20` `FetchAssetResult`
- `:27` `FetchAssetError`
- `:33` `FetchAssetResponse`

From `src/commands/handlers/actor/actions/_shared.ts`:

- `:24` `CraftingFormulaEntry`

From `src/commands/handlers/token/GridPathfinder.ts`:

- `:10` `PathfinderConfig`

From `src/commands/types/base.ts`:

- `:282` `CommandHandler` — defined but never referenced; truly unused

#### F13 (1 export, 33 types = 34 findings)

See F13 section at top of document for the full list. These are the type findings in api-bridge only; the `game` export from `actorTypes.ts:100` is the one export in this bucket.

#### PUBLIC (26 types)

These are intentional API types: transport contracts, config shapes, and wire-protocol types. Annotate with `ignoreExportsUsedInFile` for the `commands/types/` directory. No deletions.

**Transport layer** (`src/transport/WebSocketClient.ts`):

- `:3` `WebSocketClientConfig`
- `:9` `MessageHandler`
- `:10` `ConnectionHandler`
- `:17` `BridgeEvent`
- `:23` `BridgeEventResponse`
- `:42` `WebSocketFactory`

**Config types** (`src/config/types.ts`):

- `:1` `DeepPartial`
- `:10` `WebSocketConfig`
- `:16` `LoggingConfig`

**Transport re-exports** (`src/transport/index.ts`):

- `:2` `WebSocketClientConfig` (re-export)
- `:2` `WebSocketLike`
- `:2` `WebSocketFactory` (re-export)
- `:4` `EventPublisher`

**Wire-contract types** (`src/commands/types/`):

- `combat.ts:94` `InitiativeResult` — component of `RollInitiativeResult.results[]`; used in same file; ignoreExportsUsedInFile
- `scene.ts:27` `WallDefinition` — component of `CreateSceneParams.walls[]`; used in same file
- `scene.ts:44` `UvttResolution` — component of `UvttScene`; used in same file
- `scene.ts:50` `UvttPortal` — component of `UvttScene`; used in same file
- `scene.ts:58` `UvttData` — component of `UvttScene`; used in same file
- `scene.ts:166` `SceneGridResult` — component of `SceneDetailResult.grid`; used in same file
- `compendium.ts:126` `CompendiumEmbeddedItem` — component of `CompendiumItemResult.items[]`; used in same file
- `table.ts:19` `CreateTableResultData` — component of `CreateTableParams.results[]`; used in same file
- `item.ts:24` `ItemSystemData` — component of multiple item types; used in same file
- `item.ts:97` `ActivityInfo` — component of item results; used in same file
- `journal.ts:3` `JournalPageType` — discriminant type for page variants; used in same file
- `actor.ts:182` `WorldInfoData` — component of `WorldInfoResult`; used in same file
- `actor.ts:190` `WorldCounts` — component of `WorldInfoResult`; used in same file

#### JUDGMENT (2 exports)

**Question**: Are these re-export chains intentional public API, or dead? Tests import `KNOWN_ACTIONS` directly from `InvokeActorActionHandler.ts`, not via either index. If the re-exports are only for documentation/surface purposes, annotate with knip ignore; otherwise delete.

- `apps/foundry-api-bridge/src/commands/handlers/index.ts:13` `KNOWN_ACTIONS` — re-exported from InvokeActorActionHandler; tests import directly from the source; re-export may be dead
- `apps/foundry-api-bridge/src/commands/handlers/actor/index.ts:5` `KNOWN_ACTIONS` — same re-export chain; same question

---

### Workspace: packages/ai

#### JUDGMENT (1 type)

- `packages/ai/src/shared/anthropic.ts:13` `AnthropicCallInput` — parameter type of the exported `callAnthropic()` function; used within the file. **Question**: Do ai-package consumers (`apps/dm-tool`) ever need to import this type to annotate their own call-site variables? If yes → PUBLIC; if they construct the param as an inline object literal → DELETE.

---

## Recommended cleanup PR order

1. **F13 first** — Largest single-PR collapse; eliminates ~33 type findings and the `game` export from api-bridge. Creates `src/types/foundry-event-shapes.ts`, replaces inline shim declarations in each handler's `*Types.ts` file.

2. **Workspace cleanups in parallel** (after F13 merges or in separate PRs by workspace):
   - **`apps/foundry-api-bridge`** (post-F13): remove 9 function exports from sceneTypes.ts and 62 type exports from handler files. Ask the user about the 2 KNOWN_ACTIONS re-exports in the PR description.
   - **`apps/dm-tool`**: delete 25 exports + 8 types (DELETE bucket); add `entry: ["electron/**/*.test.ts"]` to dm-tool knip config to clear the 5 SCRIPT-USED findings automatically; ask about 10 JUDGMENT types in PR description.
   - **`apps/player-portal`**: delete 21 exports + 17 types; annotate 23 `src/api/types/*` exports with `ignoreExportsUsedInFile`; annotate `_ReexportForTsCheck`. Ask about the 0 JUDGMENT items (all resolved).
   - **`apps/foundry-mcp`**: delete 7 findings; ask about 4 JUDGMENT re-exports.
   - **`packages/ai`**: resolve the 1 JUDGMENT item; then either delete or annotate.

3. **Flip the CI flag** — One-line edit to `package.json` knip script (drop the `--include` filter or expand it to include `exports,types,nsExports,nsTypes`). Zero findings → green CI.

---

## Open questions for the user

> **All four resolved on 2026-05-04 — see Resolutions section near the top of this doc. All 17 JUDGMENT items moved to DELETE.**

1. ~~**dm-tool `compendium/index.ts` barrel** (10 JUDGMENT types)~~ — **Resolved → DELETE.** No consumers anywhere in `apps/` or `packages/`.

2. ~~**api-bridge `KNOWN_ACTIONS` re-export chain** (2 JUDGMENT exports)~~ — **Resolved → DELETE.** Tests and the only real consumer import directly from `InvokeActorActionHandler.ts`; the handler-side barrels are dead.

3. ~~**foundry-mcp `compendium-cache.ts` re-exports** (4 JUDGMENT types)~~ — **Resolved → DELETE.** Other consumers import directly from `compendium-types.ts`; the re-exports have no callers.

4. ~~**`AnthropicCallInput` in packages/ai** (1 JUDGMENT type)~~ — **Resolved → DELETE.** All three callers of `callAnthropic()` use inline object literals; the export is unused as a type annotation.
