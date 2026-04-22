// Wire-contract types for the foundry-mcp REST surface (`/api/*`).
//
// Consumed by the foundry-mcp server as its response shapes, by the
// character-creator SPA for its typed fetch wrappers, and by dm-tool's
// compendium HTTP client + MCP tool wrappers. Keep this file dependency-
// free and runtime-free so any side of the graph can import it.
//
// If foundry-mcp narrows or widens a shape, update it here — don't copy
// forward into consumer-local types.

// ─── Error responses ───────────────────────────────────────────────────

export interface ApiError {
  error: string;
  suggestion?: string;
}

// ─── Actors ────────────────────────────────────────────────────────────

export interface ActorSummary {
  id: string;
  name: string;
  type: string;
  img: string;
}

/** Narrow result shape returned by create-actor / update-actor — just
 *  enough to thread the new id back to the caller and to log a name /
 *  folder change. The full actor is re-fetched via
 *  `/api/actors/:id/prepared` when the caller needs to render it. */
export interface ActorRef {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  folder: string | null;
}

/** Result shape for add-item-from-compendium: the newly-created
 *  embedded item id, plus a back-reference to the actor for logging. */
export interface ActorItemRef {
  id: string;
  name: string;
  type: string;
  img: string;
  actorId: string;
  actorName: string;
}

export interface PreparedActorItem {
  id: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
}

export interface PreparedActor {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  system: Record<string, unknown>;
  items: PreparedActorItem[];
  /** Optional: Foundry module flags (`flags.<scope>.<key>` → value).
   *  character-creator stores its sheet-level preferences (e.g. the
   *  uploaded background image path) under the `character-creator`
   *  scope. Missing when the bridge/mock doesn't surface them. */
  flags?: Record<string, Record<string, unknown>>;
}

/** POST /api/uploads response — the relative path the file was written
 *  to (inside the Foundry Data dir) plus the byte count for client-side
 *  sanity checks. The path is what the SPA stores as the background
 *  reference on the actor flag. */
export interface UploadAssetResult {
  path: string;
  bytes: number;
}

// ─── Prices (shared between compendium rows and physical items) ────────

export interface ItemPrice {
  value: { pp?: number; gp?: number; sp?: number; cp?: number };
  per?: number;
}

// ─── Compendium search ─────────────────────────────────────────────────

export interface CompendiumSearchOptions {
  /** Free-text query tokenised on whitespace; every token must appear
   *  in a candidate's name. Optional — pickers can browse by trait /
   *  pack / level alone. The server returns an empty response when
   *  every filter field is empty, as a guard rail. */
  q?: string;
  /** Restrict to one or more packs (e.g. ['pf2e.feats-srd']). When
   *  omitted, every pack matching `documentType` is searched. */
  packIds?: string[];
  /** Restrict to packs whose document type matches (e.g. 'Item'). */
  documentType?: string;
  /** Every trait in this list must be present on `system.traits.value`.
   *  Creator pickers use this to scope e.g. class-feat slots to the
   *  character's class trait. */
  traits?: string[];
  /** OR-filter: a candidate qualifies if any of its traits matches any
   *  value here. Composes with `traits` when both are supplied.
   *  Used by the ancestry-feat picker to surface both parent-ancestry
   *  feats and versatile-heritage feats in the same list. */
  anyTraits?: string[];
  /** Floor on `system.level.value`. Loot generation uses this to pull
   *  level-appropriate items around a target party level. */
  minLevel?: number;
  /** Cap `system.level.value`. Creator pickers use this to hide feats
   *  the character doesn't yet qualify for. */
  maxLevel?: number;
  /** OR-filter on `system.publication.title`. Matches if the candidate's
   *  publication title is any of these (case-insensitive). Drives the
   *  source-book filter in the picker. */
  sources?: string[];
  /** Restrict heritage-style items to those whose `system.ancestry.slug`
   *  matches. Versatile heritages (ancestry === null) still come
   *  through so the picker surfaces them; items without any
   *  `system.ancestry` field are unaffected. */
  ancestrySlug?: string;
  /** OR-filter on `system.traits.rarity` (common / uncommon / rare /
   *  unique). */
  rarities?: string[];
  /** OR-filter on `system.traits.size.value` for NPC actors
   *  (tiny / sm / med / lg / huge / grg). No-op on documents without a
   *  size field. */
  sizes?: string[];
  /** OR-filter on creature type. Pf2e encodes creature types as entries
   *  in `system.traits.value` on NPC actors; matched by intersection.
   *  No-op on documents without creature-type traits. */
  creatureTypes?: string[];
  /** Prefix-match filter on `system.usage.value` for items (case
   *  insensitive). 'held' matches 'held-in-one-hand', 'worn' matches
   *  'worn-necklace', etc. */
  usageCategories?: string[];
  /** Magical-items flag. `true` restricts to items carrying the
   *  `magical` trait or any tradition trait
   *  (arcane/divine/occult/primal). `false` restricts to items with
   *  none of those. Omit for no filter. */
  isMagical?: boolean;
  /** Monster combat-stat ranges, read from bestiary actor
   *  `system.attributes.*` / `system.saves.*`. Skipped for any
   *  document that doesn't carry the field. */
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
  /** Max results. Clamped server-side to 1-10_000, defaults to 10. */
  limit?: number;
}

export interface CompendiumMatch {
  packId: string;
  packLabel: string;
  documentId: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  /** Present only when the search included a trait or maxLevel filter
   *  (the server requests the fields lazily to keep plain name-only
   *  searches lean). */
  level?: number;
  traits?: string[];
  /** Set on heritage matches whose `system.ancestry === null` — pf2e's
   *  tag for versatile heritages (Aiuvarin, Changeling, Beastkin …).
   *  Absent for ancestry-specific heritages and for non-heritage items.
   *  The picker uses this to render a "Versatile Heritages" section. */
  isVersatile?: boolean;
  /** Present only when the search was served from foundry-mcp's
   *  compendium document cache (or dm-tool's local SQLite cache). Lets
   *  the shop UI render per-tile prices without issuing a follow-up
   *  get-compendium-document call per result. Absent for uncached
   *  packs. */
  price?: ItemPrice;
  /** Cache-served enrichment fields used by dm-tool's Monster /
   *  Item browsers to render full rows without a per-result
   *  document fetch. Every field is optional and only populated by
   *  the cache-served path — uncached (bridge) searches don't carry
   *  them. `source` is the item/actor's publication title;
   *  `creatureType` is extracted from NPC traits. */
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

export interface CompendiumPack {
  id: string;
  label: string;
  type: string;
  system?: string;
  packageName?: string;
}

export interface CompendiumSource {
  title: string;
  count: number;
}

export interface CompendiumDocument {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  /** Actor-only. Foundry PrototypeToken.texture.src — the token art URL,
   *  distinct from the portrait `img`. Absent for Item documents and
   *  Actors without a configured prototype token. */
  tokenImg?: string;
  /** Full `system.*` slice. Shape varies by item type; consumers narrow
   *  defensively via `document.type`. */
  system: Record<string, unknown>;
}
