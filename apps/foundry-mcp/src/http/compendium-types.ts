// Shared types for the compendium cache + its filter / facet helpers.
//
// Sits at the bottom of the local module graph so the runtime modules
// (`compendium-cache.ts`, `compendium-search.ts`,
// `compendium-extractors.ts`) can import freely without cycles.

export interface CompendiumDocument {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  /** Actor-only. Foundry PrototypeToken.texture.src — the token art URL,
   *  distinct from the portrait `img`. Absent for Item documents and
   *  Actors without a configured prototype token. Pass-through only;
   *  search/filter logic doesn't read it. */
  tokenImg?: string;
  system: Record<string, unknown>;
}

export interface ItemPrice {
  value: Partial<Record<'pp' | 'gp' | 'sp' | 'cp', number>>;
  per?: number;
}

// Shape of the lean match emitted by the bridge's find-in-compendium
// handler (plus the `price` field we add when responding from cache).
// Optional fields beyond the bridge baseline are populated during
// cache-served filtering so dm-tool's browser tables can render a full
// row without a follow-up document fetch per result.
export interface EnrichedMatch {
  packId: string;
  packLabel: string;
  documentId: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  level?: number;
  traits?: string[];
  isVersatile?: boolean;
  price?: ItemPrice;
  rarity?: string;
  size?: string;
  creatureType?: string;
  hp?: number;
  ac?: number;
  fort?: number;
  ref?: number;
  will?: number;
  usage?: string;
  isMagical?: boolean;
  source?: string;
}

export interface SearchOptions {
  q?: string;
  packIds?: string[];
  documentType?: string;
  traits?: string[];
  anyTraits?: string[];
  sources?: string[];
  ancestrySlug?: string;
  minLevel?: number;
  maxLevel?: number;
  rarities?: string[];
  sizes?: string[];
  creatureTypes?: string[];
  usageCategories?: string[];
  isMagical?: boolean;
  hpMin?: number;
  hpMax?: number;
  acMin?: number;
  acMax?: number;
  fortMin?: number;
  fortMax?: number;
  refMin?: number;
  refMax?: number;
  willMin?: number;
  willMax?: number;
  limit?: number;
  /** Zero-based offset into the full result set for pagination. */
  offset?: number;
}

// One cached pack's worth of documents, plus the metadata used by
// `runFilter` / `aggregateFacets` (packLabel for emitting matches,
// docList for ordered iteration). Owned by the CompendiumCache class.
export interface CachedPack {
  packId: string;
  packLabel: string;
  docs: Map<string, CompendiumDocument>;
  docList: CompendiumDocument[];
  warmedAt: number;
  bytes: number;
}

export interface CompendiumCacheStats {
  packs: string[];
  docs: number;
  bytes: number;
  hits: number;
  misses: number;
  warmings: number;
  warmFailures: number;
}

// Abstraction of the bridge `sendCommand` so the cache is testable
// against a mock instead of a live WebSocket.
export type SendCommand = (type: string, params?: Record<string, unknown>) => Promise<unknown>;
