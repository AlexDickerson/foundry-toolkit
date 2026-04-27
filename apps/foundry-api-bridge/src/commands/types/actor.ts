/** Actor CRUD, prepared actor, invoke-action, statistic trace, run-script, world info, and party-member types. */

// Actor Params
export interface GetActorParams {
  actorId: string;
}

export interface CreateActorParams {
  name: string;
  type: string;
  folder?: string;
  img?: string;
  system?: Record<string, unknown>;
}

export interface CreateActorFromCompendiumParams {
  packId: string;
  actorId: string;
  name?: string;
  folder?: string;
}

export interface UpdateActorParams {
  actorId: string;
  name?: string;
  img?: string;
  folder?: string;
  system?: Record<string, unknown>;
  flags?: Record<string, Record<string, unknown>>;
}

export interface DeleteActorParams {
  actorId: string;
}

// Generic outbound-action dispatch. Routes `POST
// /api/actors/:id/actions/:action` to a per-action handler on the
// bridge (adjust-resource, adjust-condition, roll-statistic, future
// craft / strike / etc.). Payload is the action's parameter bag,
// interpreted by the action handler — the router doesn't know the
// shape. Adding a new action is one entry in the handler's registry;
// no new command type, no new route, no new SPA api method.
//
// Param + response shapes for each action live in
// `@foundry-toolkit/shared/rpc` so the SPA and the handler can't
// drift silently. The bridge re-uses those types; it doesn't
// duplicate them here.
export interface InvokeActorActionParams {
  actorId: string;
  action: string;
  params?: Record<string, unknown>;
}

// Handlers own their result shape; surfaced as `data` on the generic
// command response. Opaque to the router.
export type InvokeActorActionResult = Record<string, unknown>;

// Actor Results
export interface ActorResult {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  folder: string | null;
}

export interface ActorSummary {
  id: string;
  name: string;
  type: string;
  img: string;
}

export interface ItemSummary {
  id: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
}

export interface ActorDetailResult {
  id: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
  items: ItemSummary[];
}

export interface PreparedActorResult {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
  items: ItemSummary[];
  flags?: Record<string, Record<string, unknown>>;
}

export interface GetStatisticTraceParams {
  actorId: string;
  slug: string;
}

export type StatisticTraceResult = Record<string, unknown>;

export interface RunScriptParams {
  script: string;
}

export type RunScriptResult = unknown;

// Party member query — returns player characters from a PF2e party actor.
// Stats are pre-extracted for the dm-tool combat tracker.
export interface GetPartyMembersParams {
  /** Override the party actor name to look up.  Defaults to the
   *  `PARTY_ACTOR_NAME` constant in party-config.ts ("The Party"). */
  partyName?: string;
}

export interface PartyMemberResult {
  id: string;
  name: string;
  img: string;
  /** Perception modifier (PF2e `system.perception.mod`). Used as the
   *  default initiative modifier in the combat tracker. */
  initiativeMod: number;
  /** Current HP (`system.attributes.hp.value`). Lets the combat tracker
   *  add a PC at their actual HP rather than starting them at full. */
  hp: number;
  maxHp: number;
}

// World Info (pull query)
export type GetWorldInfoParams = Record<string, never>;

export interface WorldInfoData {
  id: string;
  title: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
}

export interface WorldCounts {
  journals: number;
  actors: number;
  items: number;
  scenes: number;
}

export interface CompendiumMetaSummary {
  id: string;
  label: string;
  type: string;
  system: string;
  count: number;
}

export interface WorldInfoResult {
  world: WorldInfoData;
  counts: WorldCounts;
  compendiumMeta: CompendiumMetaSummary[];
}
