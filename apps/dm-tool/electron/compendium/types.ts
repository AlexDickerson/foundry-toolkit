// Types mirroring the slice of foundry-mcp's /api/compendium/* contract
// dm-tool consumes. Kept in sync with
// apps/character-creator/src/api/types.ts — if the character creator
// narrows a shape we rely on here, copy the narrower version forward.
//
// Shapes land as documented on the server response; we re-export them so
// Electron IPC handlers and renderer picker code speak the same vocabulary.

export interface ApiError {
  error: string;
  suggestion?: string;
}

// ─── Compendium search ─────────────────────────────────────────────────

export interface CompendiumSearchOptions {
  /** Free-text query. Tokenised server-side on whitespace; every token
   *  must appear in a candidate's name. Optional — pickers can browse by
   *  trait / pack / level alone. */
  q?: string;
  /** Restrict to one or more packs (e.g. ['pf2e.equipment-srd']). When
   *  omitted, every pack matching `documentType` is searched. */
  packIds?: string[];
  /** Restrict to packs whose document type matches (e.g. 'Item'). */
  documentType?: string;
  /** Every trait in this list must be present on `system.traits.value`. */
  traits?: string[];
  /** OR-filter: a candidate qualifies if any trait matches. Composes with
   *  `traits` when both are supplied. */
  anyTraits?: string[];
  /** Cap `system.level.value`. */
  maxLevel?: number;
  /** OR-filter on `system.publication.title` (case-insensitive). */
  sources?: string[];
  /** Restrict heritage-style items to those whose `system.ancestry.slug`
   *  matches. Versatile heritages (ancestry === null) still come through. */
  ancestrySlug?: string;
  /** Max results. Clamped server-side; omit to use the server default. */
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
  level?: number;
  traits?: string[];
  isVersatile?: boolean;
  /** Present on matches from cached packs (e.g. pf2e.equipment-srd). */
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

export interface ItemPrice {
  value: { pp?: number; gp?: number; sp?: number; cp?: number };
  per?: number;
}
