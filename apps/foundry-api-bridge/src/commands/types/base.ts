/** Core command framework types: wire envelope, discriminant union, handler signature, and param/result maps. */

import type { JournalData, ItemData, CompendiumMetadata, CompendiumData } from '@/types/foundry';

import type {
  RollDiceParams,
  RollAbilityParams,
  RollSkillParams,
  RollSaveParams,
  RollAttackParams,
  RollDamageParams,
  RollResult,
} from './roll';

import type {
  GetActorParams,
  CreateActorParams,
  CreateActorFromCompendiumParams,
  UpdateActorParams,
  DeleteActorParams,
  InvokeActorActionParams,
  InvokeActorActionResult,
  ActorResult,
  ActorSummary,
  ActorDetailResult,
  PreparedActorResult,
  GetStatisticTraceParams,
  StatisticTraceResult,
  RunScriptParams,
  RunScriptResult,
  GetPartyMembersParams,
  PartyMemberResult,
  GetPartyForMemberParams,
  GetPartyForMemberResult,
  GetPartyStashParams,
  GetPartyStashResult,
  GetWorldInfoParams,
  WorldInfoResult,
} from './actor';

import type { SendChatMessageParams, SendChatMessageResult } from './chat';

import type {
  GetJournalsParams,
  GetJournalParams,
  CreateJournalParams,
  UpdateJournalParams,
  DeleteJournalParams,
  CreateJournalPageParams,
  UpdateJournalPageParams,
  DeleteJournalPageParams,
  JournalResult,
  JournalPageResult,
} from './journal';

import type {
  CreateCombatParams,
  AddCombatantParams,
  RemoveCombatantParams,
  CombatIdParams,
  SetTurnParams,
  RollInitiativeParams,
  SetInitiativeParams,
  RollAllInitiativeParams,
  UpdateCombatantParams,
  SetCombatantDefeatedParams,
  ToggleCombatantVisibilityParams,
  GetCombatTurnContextParams,
  CombatResult,
  CombatantResult,
  InitiativeRollResult,
  CombatTurnContext,
} from './combat';

import type {
  CreateTokenParams,
  DeleteTokenParams,
  MoveTokenParams,
  UpdateTokenParams,
  GetSceneTokensParams,
  MoveTokenPathParams,
  MoveTokenPathResult,
  SetPatrolParams,
  SetPatrolResult,
  StopPatrolParams,
  StopPatrolResult,
  GetPatrolsParams,
  GetPatrolsResult,
  TokenResult,
  SceneTokensResult,
} from './token';

import type {
  GetActorItemsParams,
  UseItemParams,
  AddItemToActorParams,
  AddItemFromCompendiumParams,
  UpdateActorItemParams,
  DeleteActorItemParams,
  GetItemsParams,
  GetItemParams,
  ActorItemsResult,
  UseItemResult,
  ItemResult,
  GetActorEffectsParams,
  ToggleActorStatusParams,
  AddActorEffectParams,
  RemoveActorEffectParams,
  UpdateActorEffectParams,
  ActorEffectsResult,
  ToggleStatusResult,
  AddEffectResult,
  RemoveEffectResult,
  UpdateEffectResult,
  ActivateItemParams,
  ActivateItemResult,
} from './item';

import type {
  GetSceneParams,
  GetScenesListParams,
  CreateSceneParams,
  CreateSceneFromUvttParams,
  CreateSceneFromUvttResult,
  CreateWallsParams,
  CreateWallsResult,
  DeleteWallParams,
  NormalizeSceneParams,
  NormalizeSceneResult,
  AnalyzeSceneParams,
  AnalyzeSceneResult,
  ActivateSceneParams,
  CaptureSceneParams,
  CaptureSceneResult,
  UpdateSceneParams,
  UpdateSceneResult,
  GetSceneBackgroundParams,
  GetSceneBackgroundResult,
  SceneDetailResult,
  SceneListResult,
  CreateSceneResult,
  ActivateSceneResult,
} from './scene';

import type {
  GetCompendiumsParams,
  GetCompendiumParams,
  FindInCompendiumParams,
  FindInCompendiumResult,
  ListCompendiumPacksParams,
  ListCompendiumPacksResult,
  ListCompendiumSourcesParams,
  ListCompendiumSourcesResult,
  GetCompendiumDocumentParams,
  GetCompendiumDocumentResult,
  DumpCompendiumPackParams,
  DumpCompendiumPackResult,
  FindOrCreateFolderParams,
  FindOrCreateFolderResult,
} from './compendium';

import type {
  ListRollTablesParams,
  GetRollTableParams,
  RollOnTableParams,
  ResetTableParams,
  CreateRollTableParams,
  UpdateRollTableParams,
  DeleteRollTableParams,
  RollTableSummary,
  RollTableResult,
  RollOnTableResult,
  ResetTableResult,
} from './table';

import type { SetEventSubscriptionParams, SetEventSubscriptionResult, DispatchParams, DispatchResult } from './event';

import type { DeleteResult, MutationResult } from './shared';

// Wire envelope
export interface Command<T = unknown> {
  id: string;
  type: CommandType;
  params: T;
}

export interface CommandResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}

export type CommandType =
  | 'roll-dice'
  | 'roll-ability'
  | 'roll-skill'
  | 'roll-save'
  | 'roll-attack'
  | 'roll-damage'
  | 'get-world-info'
  | 'get-actors'
  | 'get-actor'
  | 'get-prepared-actor'
  | 'get-statistic-trace'
  | 'run-script'
  | 'create-actor'
  | 'create-actor-from-compendium'
  | 'update-actor'
  | 'delete-actor'
  | 'invoke-actor-action'
  | 'send-chat-message'
  | 'create-journal'
  | 'update-journal'
  | 'delete-journal'
  | 'create-journal-page'
  | 'update-journal-page'
  | 'delete-journal-page'
  | 'create-combat'
  | 'add-combatant'
  | 'remove-combatant'
  | 'start-combat'
  | 'end-combat'
  | 'delete-combat'
  | 'next-turn'
  | 'previous-turn'
  | 'get-combat-state'
  | 'set-turn'
  | 'roll-initiative'
  | 'set-initiative'
  | 'roll-all-initiative'
  | 'update-combatant'
  | 'set-combatant-defeated'
  | 'toggle-combatant-visibility'
  | 'create-token'
  | 'delete-token'
  | 'move-token'
  | 'update-token'
  | 'get-scene-tokens'
  | 'move-token-path'
  | 'set-patrol'
  | 'stop-patrol'
  | 'get-patrols'
  | 'get-actor-items'
  | 'use-item'
  | 'add-item-to-actor'
  | 'add-item-from-compendium'
  | 'update-actor-item'
  | 'delete-actor-item'
  | 'get-actor-effects'
  | 'toggle-actor-status'
  | 'add-actor-effect'
  | 'remove-actor-effect'
  | 'update-actor-effect'
  | 'get-scene'
  | 'get-scenes-list'
  | 'activate-scene'
  | 'create-scene'
  | 'create-scene-from-uvtt'
  | 'create-walls'
  | 'delete-wall'
  | 'normalize-scene'
  | 'analyze-scene'
  | 'activate-item'
  | 'get-journals'
  | 'get-journal'
  | 'get-items'
  | 'get-item'
  | 'get-compendiums'
  | 'get-compendium'
  | 'find-in-compendium'
  | 'list-compendium-packs'
  | 'list-compendium-sources'
  | 'get-compendium-document'
  | 'dump-compendium-pack'
  | 'find-or-create-folder'
  | 'list-roll-tables'
  | 'get-roll-table'
  | 'roll-on-table'
  | 'reset-table'
  | 'create-roll-table'
  | 'update-roll-table'
  | 'delete-roll-table'
  | 'capture-scene'
  | 'get-scene-background'
  | 'update-scene'
  | 'get-combat-turn-context'
  | 'set-event-subscription'
  | 'fetch-asset'
  | 'get-party-members'
  | 'get-party-for-member'
  | 'get-party-stash'
  | 'dispatch';

export type CommandHandler<TParams = unknown, TResult = unknown> = (params: TParams) => Promise<TResult>;

export interface CommandParamsMap {
  'roll-dice': RollDiceParams;
  'roll-ability': RollAbilityParams;
  'roll-skill': RollSkillParams;
  'roll-save': RollSaveParams;
  'roll-attack': RollAttackParams;
  'roll-damage': RollDamageParams;
  'get-world-info': GetWorldInfoParams;
  'get-actors': Record<string, never>;
  'get-actor': GetActorParams;
  'get-prepared-actor': GetActorParams;
  'get-statistic-trace': GetStatisticTraceParams;
  'run-script': RunScriptParams;
  'create-actor': CreateActorParams;
  'create-actor-from-compendium': CreateActorFromCompendiumParams;
  'update-actor': UpdateActorParams;
  'delete-actor': DeleteActorParams;
  'invoke-actor-action': InvokeActorActionParams;
  'send-chat-message': SendChatMessageParams;
  'create-journal': CreateJournalParams;
  'update-journal': UpdateJournalParams;
  'delete-journal': DeleteJournalParams;
  'create-journal-page': CreateJournalPageParams;
  'update-journal-page': UpdateJournalPageParams;
  'delete-journal-page': DeleteJournalPageParams;
  'create-combat': CreateCombatParams;
  'add-combatant': AddCombatantParams;
  'remove-combatant': RemoveCombatantParams;
  'start-combat': CombatIdParams;
  'end-combat': CombatIdParams;
  'delete-combat': CombatIdParams;
  'next-turn': CombatIdParams;
  'previous-turn': CombatIdParams;
  'get-combat-state': CombatIdParams;
  'set-turn': SetTurnParams;
  'roll-initiative': RollInitiativeParams;
  'set-initiative': SetInitiativeParams;
  'roll-all-initiative': RollAllInitiativeParams;
  'update-combatant': UpdateCombatantParams;
  'set-combatant-defeated': SetCombatantDefeatedParams;
  'toggle-combatant-visibility': ToggleCombatantVisibilityParams;
  'create-token': CreateTokenParams;
  'delete-token': DeleteTokenParams;
  'move-token': MoveTokenParams;
  'update-token': UpdateTokenParams;
  'get-scene-tokens': GetSceneTokensParams;
  'move-token-path': MoveTokenPathParams;
  'set-patrol': SetPatrolParams;
  'stop-patrol': StopPatrolParams;
  'get-patrols': GetPatrolsParams;
  'get-actor-items': GetActorItemsParams;
  'use-item': UseItemParams;
  'add-item-to-actor': AddItemToActorParams;
  'add-item-from-compendium': AddItemFromCompendiumParams;
  'update-actor-item': UpdateActorItemParams;
  'delete-actor-item': DeleteActorItemParams;
  'get-actor-effects': GetActorEffectsParams;
  'toggle-actor-status': ToggleActorStatusParams;
  'add-actor-effect': AddActorEffectParams;
  'remove-actor-effect': RemoveActorEffectParams;
  'update-actor-effect': UpdateActorEffectParams;
  'get-scene': GetSceneParams;
  'get-scenes-list': GetScenesListParams;
  'activate-scene': ActivateSceneParams;
  'create-scene': CreateSceneParams;
  'create-scene-from-uvtt': CreateSceneFromUvttParams;
  'create-walls': CreateWallsParams;
  'delete-wall': DeleteWallParams;
  'normalize-scene': NormalizeSceneParams;
  'analyze-scene': AnalyzeSceneParams;
  'activate-item': ActivateItemParams;
  'get-journals': GetJournalsParams;
  'get-journal': GetJournalParams;
  'get-items': GetItemsParams;
  'get-item': GetItemParams;
  'get-compendiums': GetCompendiumsParams;
  'get-compendium': GetCompendiumParams;
  'find-in-compendium': FindInCompendiumParams;
  'list-compendium-packs': ListCompendiumPacksParams;
  'list-compendium-sources': ListCompendiumSourcesParams;
  'get-compendium-document': GetCompendiumDocumentParams;
  'dump-compendium-pack': DumpCompendiumPackParams;
  'find-or-create-folder': FindOrCreateFolderParams;
  'list-roll-tables': ListRollTablesParams;
  'get-roll-table': GetRollTableParams;
  'roll-on-table': RollOnTableParams;
  'reset-table': ResetTableParams;
  'create-roll-table': CreateRollTableParams;
  'update-roll-table': UpdateRollTableParams;
  'delete-roll-table': DeleteRollTableParams;
  'capture-scene': CaptureSceneParams;
  'get-scene-background': GetSceneBackgroundParams;
  'update-scene': UpdateSceneParams;
  'get-combat-turn-context': GetCombatTurnContextParams;
  'set-event-subscription': SetEventSubscriptionParams;
  'fetch-asset': { path: string };
  'get-party-members': GetPartyMembersParams;
  'get-party-for-member': GetPartyForMemberParams;
  'get-party-stash': GetPartyStashParams;
  'dispatch': DispatchParams;
}

export interface CommandResultMap {
  'roll-dice': RollResult;
  'roll-ability': RollResult;
  'roll-skill': RollResult;
  'roll-save': RollResult;
  'roll-attack': RollResult;
  'roll-damage': RollResult;
  'get-world-info': WorldInfoResult;
  'get-actors': ActorSummary[];
  'get-actor': ActorDetailResult;
  'get-prepared-actor': PreparedActorResult;
  'get-statistic-trace': StatisticTraceResult;
  'run-script': RunScriptResult;
  'create-actor': ActorResult;
  'create-actor-from-compendium': ActorResult;
  'update-actor': ActorResult;
  'delete-actor': DeleteResult;
  'invoke-actor-action': InvokeActorActionResult;
  'send-chat-message': SendChatMessageResult;
  'create-journal': JournalResult;
  'update-journal': JournalResult;
  'delete-journal': DeleteResult;
  'create-journal-page': JournalPageResult;
  'update-journal-page': JournalPageResult;
  'delete-journal-page': DeleteResult;
  'create-combat': CombatResult;
  'add-combatant': CombatantResult;
  'remove-combatant': DeleteResult;
  'start-combat': CombatResult;
  'end-combat': DeleteResult;
  'delete-combat': DeleteResult;
  'next-turn': CombatResult;
  'previous-turn': CombatResult;
  'get-combat-state': CombatResult;
  'set-turn': CombatResult;
  'roll-initiative': InitiativeRollResult;
  'set-initiative': CombatantResult;
  'roll-all-initiative': InitiativeRollResult;
  'update-combatant': CombatantResult;
  'set-combatant-defeated': CombatantResult;
  'toggle-combatant-visibility': CombatantResult;
  'create-token': TokenResult;
  'delete-token': DeleteResult;
  'move-token': MutationResult;
  'update-token': MutationResult;
  'get-scene-tokens': SceneTokensResult;
  'move-token-path': MoveTokenPathResult;
  'set-patrol': SetPatrolResult;
  'stop-patrol': StopPatrolResult;
  'get-patrols': GetPatrolsResult;
  'get-actor-items': ActorItemsResult;
  'use-item': UseItemResult;
  'add-item-to-actor': ItemResult;
  'add-item-from-compendium': ItemResult;
  'update-actor-item': ItemResult;
  'delete-actor-item': DeleteResult;
  'get-actor-effects': ActorEffectsResult;
  'toggle-actor-status': ToggleStatusResult;
  'add-actor-effect': AddEffectResult;
  'remove-actor-effect': RemoveEffectResult;
  'update-actor-effect': UpdateEffectResult;
  'get-scene': SceneDetailResult;
  'get-scenes-list': SceneListResult;
  'activate-scene': ActivateSceneResult;
  'create-scene': CreateSceneResult;
  'create-scene-from-uvtt': CreateSceneFromUvttResult;
  'create-walls': CreateWallsResult;
  'delete-wall': DeleteResult;
  'normalize-scene': NormalizeSceneResult;
  'analyze-scene': AnalyzeSceneResult;
  'activate-item': ActivateItemResult;
  'get-journals': JournalData[];
  'get-journal': JournalData;
  'get-items': ItemData[];
  'get-item': ItemData;
  'get-compendiums': CompendiumMetadata[];
  'get-compendium': CompendiumData;
  'find-in-compendium': FindInCompendiumResult;
  'list-compendium-packs': ListCompendiumPacksResult;
  'list-compendium-sources': ListCompendiumSourcesResult;
  'get-compendium-document': GetCompendiumDocumentResult;
  'dump-compendium-pack': DumpCompendiumPackResult;
  'find-or-create-folder': FindOrCreateFolderResult;
  'list-roll-tables': RollTableSummary[];
  'get-roll-table': RollTableResult;
  'roll-on-table': RollOnTableResult;
  'reset-table': ResetTableResult;
  'create-roll-table': RollTableResult;
  'update-roll-table': RollTableResult;
  'delete-roll-table': DeleteResult;
  'capture-scene': CaptureSceneResult;
  'get-scene-background': GetSceneBackgroundResult;
  'update-scene': UpdateSceneResult;
  'get-combat-turn-context': CombatTurnContext;
  'set-event-subscription': SetEventSubscriptionResult;
  'fetch-asset': { ok: boolean; contentType?: string; bytes?: string; status?: number; error?: string };
  'get-party-members': PartyMemberResult[];
  'get-party-for-member': GetPartyForMemberResult;
  'get-party-stash': GetPartyStashResult;
  'dispatch': DispatchResult;
}
