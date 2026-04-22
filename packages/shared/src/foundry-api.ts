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
  /** Max results. Clamped server-side to 1-100, defaults to 10. */
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
  /** Present on matches from cached packs (e.g. pf2e.equipment-srd)
   *  served by dm-tool's local SQLite cache. */
  price?: ItemPrice;
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
  /** Full `system.*` slice. Shape varies by item type; consumers narrow
   *  defensively via `document.type`. */
  system: Record<string, unknown>;
}
