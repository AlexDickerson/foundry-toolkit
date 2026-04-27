/** Item CRUD, use-item, activate-item, and actor effect command params and results. */

import type { RollResult } from './roll';

// Item Commands
export interface GetActorItemsParams {
  actorId: string;
  type?: string;
  equipped?: boolean;
  hasActivities?: boolean;
}

export interface UseItemParams {
  actorId: string;
  itemId: string;
  activityId?: string;
  activityType?: string;
  consume?: boolean;
  scaling?: number;
  showInChat?: boolean;
}

// Item CRUD Commands
export interface ItemSystemData {
  description?: { value: string };
  quantity?: number;
  weight?: { value: number; units?: string };
  price?: { value: number; denomination?: string };
  rarity?: string;
  identified?: boolean;
  equipped?: boolean;
  attunement?: number;
}

export interface AddItemToActorParams {
  actorId: string;
  name: string;
  type: string;
  img?: string;
  system?: ItemSystemData;
}

export interface AddItemFromCompendiumParams {
  actorId: string;
  packId: string;
  itemId: string;
  name?: string;
  quantity?: number;
  /** Shallow-merged into the copied item's `system` before creation.
   *  Used by the character-creator to tag feats with the slot
   *  location pf2e expects (`system.location = 'class-1'`, etc.)
   *  so the sheet and Progression tab can match them to slots. */
  systemOverrides?: Record<string, unknown>;
}

export interface UpdateActorItemParams {
  actorId: string;
  itemId: string;
  name?: string;
  img?: string;
  system?: Partial<ItemSystemData>;
}

export interface DeleteActorItemParams {
  actorId: string;
  itemId: string;
}

// Pull query params
export type GetItemsParams = Record<string, never>;

export interface GetItemParams {
  itemId: string;
}

// Item Results
export interface ItemDetailSummary {
  id: string;
  name: string;
  type: string;
  img: string;
  equipped: boolean;
  quantity: number;
  hasActivities: boolean;
  activityTypes: string[];
  description: string;
  damage: Record<string, unknown> | null;
  range: Record<string, unknown> | null;
}

export interface ActorItemsResult {
  actorId: string;
  actorName: string;
  items: ItemDetailSummary[];
}

export interface ActivityInfo {
  id: string;
  name: string;
  type: string;
}

export interface UseItemResult {
  itemId: string;
  itemName: string;
  itemType: string;
  activityUsed?: ActivityInfo;
  rolls: RollResult[];
  chatMessageId?: string;
}

export interface ItemResult {
  id: string;
  name: string;
  type: string;
  img: string;
  actorId: string;
  actorName: string;
}

// Effect Commands
export interface GetActorEffectsParams {
  actorId: string;
  includeDisabled?: boolean;
}

export interface EffectChangeData {
  key: string;
  value: string;
  mode: number;
}

export interface EffectDurationData {
  seconds?: number;
  rounds?: number;
  turns?: number;
}

export interface EffectSummary {
  id: string;
  name: string;
  img: string;
  disabled: boolean;
  isTemporary: boolean;
  statuses: string[];
  origin: string | null;
  changes?: EffectChangeData[];
  duration?: EffectDurationData;
}

export interface ActorEffectsResult {
  actorId: string;
  actorName: string;
  effects: EffectSummary[];
  activeStatuses: string[];
}

export interface ToggleActorStatusParams {
  actorId: string;
  statusId: string;
  active?: boolean;
  overlay?: boolean;
}

export interface ToggleStatusResult {
  actorId: string;
  statusId: string;
  active: boolean;
  effectId?: string;
}

export interface AddActorEffectParams {
  actorId: string;
  name: string;
  img?: string;
  disabled?: boolean;
  statuses?: string[];
  changes?: EffectChangeData[];
  duration?: EffectDurationData;
  origin?: string;
}

export interface AddEffectResult {
  actorId: string;
  effectId: string;
  name: string;
}

export interface RemoveActorEffectParams {
  actorId: string;
  effectId: string;
}

export interface RemoveEffectResult {
  actorId: string;
  effectId: string;
  removed: boolean;
}

export interface UpdateActorEffectParams {
  actorId: string;
  effectId: string;
  name?: string;
  img?: string;
  disabled?: boolean;
  changes?: EffectChangeData[];
  duration?: EffectDurationData;
}

export interface UpdateEffectResult {
  actorId: string;
  effectId: string;
  name: string;
}

// Activate Item Command (full automation pipeline)
export interface ActivateItemParams {
  actorId: string;
  itemId: string;
  activityId?: string;
  activityType?: string;
  targetTokenIds?: string[];
  templatePosition?: { x: number; y: number; direction?: number };
  spellLevel?: number;
}

export interface MidiWorkflowResult {
  attackTotal: number | undefined;
  damageTotal: number | undefined;
  isCritical: boolean;
  isFumble: boolean;
  hitTargetIds: string[];
  saveTargetIds: string[];
  failedSaveTargetIds: string[];
}

export interface ActivateItemResult {
  itemId: string;
  itemName: string;
  itemType: string;
  activityUsed?: ActivityInfo;
  activated: boolean;
  targetsSet: number;
  rolls: RollResult[];
  chatMessageId?: string;
  workflow?: MidiWorkflowResult;
}
