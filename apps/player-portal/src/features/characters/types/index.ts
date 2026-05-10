// Types for the foundry-mcp REST API surface.
//
// The wire-contract shapes (actor / item / compendium DTOs, ApiError)
// live in `@foundry-toolkit/shared/foundry-api` — shared with dm-tool.
// This barrel re-exports them alongside the character-creator–only shapes
// that describe the PF2e `system.*` slices each tab reads.

export type {
  ActorItemRef,
  ActorRef,
  ActorSummary,
  ApiError,
  CompendiumDocument,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
  ItemPrice,
  PreparedActor,
  PreparedActorItem,
  StatusEffect,
} from '@foundry-toolkit/shared/foundry-api';

export * from './primitives';
export * from './stats';
export * from './resources';
export * from './defenses';
export * from './biography';
export * from './movement';
export * from './crafting';
export * from './strikes';
export * from './feats';
export * from './actions';
export * from './class';
export * from './items';
export * from './spells';
export * from './character';
export * from './prepared';
