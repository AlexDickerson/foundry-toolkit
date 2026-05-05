// Re-export the foundry-mcp `/api/compendium/*` wire types from the shared
// workspace package. Previously this file kept a local mirror of the shapes
// to allow independent shipping; now that all consumers live in one
// monorepo, the shared module is the single source of truth.

export type {
  CompendiumDocument,
  CompendiumEmbeddedItem,
  CompendiumMatch,
  CompendiumPack,
  CompendiumSearchOptions,
  CompendiumSource,
  ItemPrice,
} from '@foundry-toolkit/shared/foundry-api';
