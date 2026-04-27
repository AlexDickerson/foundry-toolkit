/** Compendium query, document fetch, folder, and pack-listing command params and results. */

// Pull query params (Batch 2)
export type GetCompendiumsParams = Record<string, never>;

export interface GetCompendiumParams {
  packId: string;
}

export interface FindInCompendiumParams {
  /** Substring (case-insensitive) to match against document names. Tokenized
   *  on whitespace — all tokens must appear in the name. */
  name: string;
  /** Optional — restrict to one or more packs (e.g. 'pf2e.feats-srd' or
   *  ['pf2e.feats-srd', 'pf2e.classfeatures']). A string and a
   *  single-element array behave identically. When omitted, every pack
   *  (filtered by documentType if provided) is searched. */
  packId?: string | string[];
  /** Optional — restrict to packs of this document type (e.g. 'Actor', 'Item'). */
  documentType?: string;
  /** Optional — require every trait in this list to be present on the
   *  candidate's `system.traits.value`. Used by creator pickers to
   *  scope class feat slots to the character's class trait, ancestry
   *  feat slots to the ancestry trait, etc. */
  traits?: string[];
  /** Optional — OR-filter: a candidate qualifies if any of its
   *  `system.traits.value` entries matches any value in this list
   *  (case-insensitive). Used for ancestry feat pickers where a
   *  versatile heritage (Aiuvarin, Changeling …) exposes a second
   *  pool of feats tagged with the heritage slug alongside the
   *  parent ancestry's feats. `traits` and `anyTraits` compose — a
   *  candidate must satisfy both filters when both are supplied. */
  anyTraits?: string[];
  /** Optional — cap `system.level.value` at this level. Used by feat
   *  pickers to hide feats the character doesn't yet qualify for. */
  maxLevel?: number;
  /** Optional — OR-filter on `system.publication.title`. A candidate
   *  qualifies if its publication title matches any value in the
   *  list (case-insensitive). Used by the source-book filter in the
   *  picker ("Pathfinder Player Core", "GM Core", ...). */
  sources?: string[];
  /** Optional — restrict heritage-style items to those whose
   *  `system.ancestry.slug` matches. Items with `system.ancestry ===
   *  null` (versatile heritages like Aiuvarin) are passed through
   *  regardless so the heritage picker still surfaces them. Items
   *  without any `system.ancestry` field at all are unaffected. */
  ancestrySlug?: string;
  /** Max results to return. Defaults to 10. */
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
  /** Present when the filter path required loading index fields
   *  (traits or maxLevel). Omitted on plain name-only queries to keep
   *  the response small. */
  level?: number;
  traits?: string[];
  /** Set to `true` for heritage items with `system.ancestry === null`
   *  (versatile heritages like Aiuvarin, Changeling, Beastkin). Absent
   *  for ancestry-specific heritages and for items outside the
   *  heritage tree. Callers group the picker list by this flag. */
  isVersatile?: boolean;
}

export interface FindInCompendiumResult {
  matches: CompendiumMatch[];
}

export interface ListCompendiumPacksParams {
  /** Optional filter — restrict to packs of this document type
   *  (e.g. 'Item', 'Actor', 'JournalEntry'). */
  documentType?: string;
}

export interface CompendiumPackInfo {
  id: string; // pack.collection (e.g. 'pf2e.feats-srd')
  label: string; // pack.metadata.label (e.g. 'Class Feats')
  type: string; // pack.metadata.type (e.g. 'Item')
  system?: string; // pack.metadata.system
  packageName?: string; // pack.metadata.packageName
}

export interface ListCompendiumPacksResult {
  packs: CompendiumPackInfo[];
}

export interface ListCompendiumSourcesParams {
  /** Optional — restrict the walk to packs of this document type. */
  documentType?: string;
  /** Optional — restrict the walk to these packs (e.g.
   *  ['pf2e.feats-srd']). When omitted, every pack matching
   *  documentType is walked. */
  packId?: string | string[];
  /** Free-text query applied to names and trait tags, same semantics
   *  as find-in-compendium. When present, only matching entries are
   *  counted per source. */
  name?: string;
  /** AND-required traits, same semantics as find-in-compendium. */
  traits?: string[];
  /** Cap on `system.level.value`, same semantics as find-in-compendium. */
  maxLevel?: number;
}

export interface CompendiumSource {
  title: string;
  /** How many entries across the scanned packs were published here.
   *  Lets the UI show a count next to each source. */
  count: number;
}

export interface ListCompendiumSourcesResult {
  sources: CompendiumSource[];
}

export interface GetCompendiumDocumentParams {
  uuid: string; // e.g. 'Compendium.pf2e.feats-srd.Item.abc123'
}

export interface CompendiumEmbeddedItem {
  id: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
}

export interface CompendiumDocumentData {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  /** Actor-only. Foundry PrototypeToken.texture.src — the token
   *  art URL, distinct from the portrait `img`. Absent for Item
   *  documents and for Actors without a configured prototype token. */
  tokenImg?: string;
  /** Full `system.*` slice as serialized by `document.toObject(false)`.
   *  Shape varies by item type; the picker treats it as raw data and
   *  reads only what its renderer needs. */
  system: Record<string, unknown>;
  /** Embedded item documents (spells, actions, feats, spellcastingEntry, …).
   *  Populated on Actor documents by `getCompendiumDocumentHandler` so the
   *  detail panel can render spell lists and passive abilities.
   *  Absent on Item documents and in `dumpCompendiumPackHandler` responses
   *  (the cache doesn't need them). */
  items?: CompendiumEmbeddedItem[];
}

export interface GetCompendiumDocumentResult {
  document: CompendiumDocumentData;
}

export interface DumpCompendiumPackParams {
  packId: string; // e.g. 'pf2e.equipment-srd'
}

export interface DumpCompendiumPackResult {
  packId: string;
  packLabel: string;
  documents: CompendiumDocumentData[];
}

/** Folder document types Foundry supports. The set mirrors
 *  CONST.FOLDER_DOCUMENT_TYPES in recent Foundry versions. */
export type FolderDocumentType =
  | 'Actor'
  | 'Item'
  | 'Scene'
  | 'JournalEntry'
  | 'RollTable'
  | 'Macro'
  | 'Playlist'
  | 'Adventure'
  | 'Card';

export interface FindOrCreateFolderParams {
  /** Folder name to look up or create. Matched case-insensitively against
   *  existing folders of the same document type. */
  name: string;
  /** Document type the folder holds. Required because Foundry scopes
   *  folder names by document type — an "Actor" folder and an "Item" folder
   *  can share a name without conflict. */
  type: FolderDocumentType;
  /** Optional parent folder ID to nest under. Existing folders match by
   *  name + parent, so the same name under different parents counts as
   *  separate folders. */
  parentFolderId?: string;
}

export interface FindOrCreateFolderResult {
  id: string;
  name: string;
  type: string;
  /** true when a new folder was created, false when an existing one was
   *  reused. Lets callers decide whether to emit a "created" or "reused"
   *  status message. */
  created: boolean;
}
