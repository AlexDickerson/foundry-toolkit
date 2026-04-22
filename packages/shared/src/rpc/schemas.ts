// Zod schemas for the foundry-mcp `/api/*` HTTP surface.
//
// These are used by foundry-mcp to validate incoming requests and by
// character-creator to derive typed request bodies via `z.infer<>`.
// The server is the authority; any shape drift shows up as a TS error
// in every consumer the next time they typecheck.

import { z } from 'zod/v4';

export const actorIdParam = z.object({
  id: z.string().min(1),
});

export const actorTraceParams = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
});

// `traits` / `packId` accept either ?foo=a,b,c or repeated
// ?foo=a&foo=b. Fastify's default querystring parser (qs) gives us a
// string[] for the latter and a string for the former; we normalise
// both to string[].
const csvParam = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((t) => t.trim()).filter((t) => t.length > 0))
  .optional();

// Query-string booleans arrive as plain strings; coerce only
// `'true'` / `'false'` (case-insensitive) so typos 400 instead of
// silently truthifying.
const boolParam = z
  .union([z.boolean(), z.enum(['true', 'false', 'TRUE', 'FALSE', 'True', 'False'])])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'))
  .optional();

// `q` is optional so pickers can browse by trait/pack/level without a
// text query. The handler short-circuits to an empty response unless
// at least one of q / packId / traits / maxLevel is provided, to avoid
// accidentally returning the entire compendium.
export const compendiumSearchQuery = z.object({
  q: z.string().optional(),
  packId: csvParam,
  documentType: z.string().optional(),
  traits: csvParam,
  anyTraits: csvParam,
  sources: csvParam,
  ancestrySlug: z.string().optional(),
  minLevel: z.coerce.number().int().nonnegative().max(30).optional(),
  maxLevel: z.coerce.number().int().nonnegative().max(30).optional(),
  // Rarity filter (common / uncommon / rare / unique in pf2e). CSV or
  // repeated param; matched against `system.traits.rarity`.
  rarities: csvParam,
  // Size filter (tiny / sm / med / lg / huge / grg). Matched against
  // `system.traits.size.value`.
  sizes: csvParam,
  // Creature-type filter (dragon / humanoid / undead …). Matched by
  // intersection with `system.traits.value` — creature types are
  // encoded as traits on pf2e NPC actors.
  creatureTypes: csvParam,
  // Usage-category filter for items. Accepts case-insensitive prefixes
  // of `system.usage.value` (e.g. 'held' matches 'held-in-one-hand';
  // 'worn' matches 'worn-necklace'). Kept as a prefix rather than a
  // bucket enum so the server doesn't have to maintain pf2e's usage
  // taxonomy.
  usageCategories: csvParam,
  // Magical-items flag. True = only items carrying the `magical` trait
  // (or any of arcane/divine/occult/primal). False = explicitly
  // non-magical. Omit for no filter.
  isMagical: boolParam,
  // Monster combat-stat range filters. All read from the bestiary
  // actor's `system.attributes.*` / `system.saves.*` — skipped for any
  // document that doesn't carry the field, so item-pack searches see
  // them as no-ops.
  hpMin: z.coerce.number().int().nonnegative().optional(),
  hpMax: z.coerce.number().int().nonnegative().optional(),
  acMin: z.coerce.number().int().nonnegative().optional(),
  acMax: z.coerce.number().int().nonnegative().optional(),
  fortMin: z.coerce.number().int().optional(),
  fortMax: z.coerce.number().int().optional(),
  refMin: z.coerce.number().int().optional(),
  refMax: z.coerce.number().int().optional(),
  willMin: z.coerce.number().int().optional(),
  willMax: z.coerce.number().int().optional(),
  // Hard ceiling chosen so a single request can return every item in
  // the largest cached pack (pf2e.equipment-srd ≈ 5.6k items) without
  // pagination. The in-memory cache's filter/sort is microseconds on
  // this size; uncached searches already iterate the full index on
  // every call, so the bigger cap just widens the response payload.
  limit: z.coerce.number().int().positive().max(10_000).optional(),
});

export const listCompendiumPacksQuery = z.object({
  documentType: z.string().optional(),
});

export const listCompendiumSourcesQuery = z.object({
  documentType: z.string().optional(),
  packId: csvParam,
  q: z.string().optional(),
  traits: csvParam,
  maxLevel: z.coerce.number().int().nonnegative().max(30).optional(),
});

// Server-side DISTINCT aggregation over one or more cached packs. Fronts
// dm-tool's Monster Browser + Item Browser sidebar filter panels, which
// previously derived these values client-side from pf2e.db. Scoped by
// `documentType` (e.g. 'npc' vs 'Item') and optionally narrowed to a
// specific pack subset; omit both to get facets across every cached pack.
export const listCompendiumFacetsQuery = z.object({
  documentType: z.string().optional(),
  packId: csvParam,
});

export const getCompendiumDocumentQuery = z.object({
  uuid: z.string().min(1),
});

export const evalBody = z.object({
  script: z.string().min(1).max(100_000),
});

// Channels the event-stream route accepts. Keep this synchronised with
// the channels the Foundry module's EventChannelController knows how
// to register. Requests for unknown channels 400 with a clear suggestion
// rather than opening a dead stream.
export const EVENT_CHANNELS = ['rolls', 'chat', 'combat'] as const;

export const eventChannelParam = z.object({
  channel: z.enum(EVENT_CHANNELS),
});

// Minimal creation payload for the character-creator flow: a type +
// a (possibly empty) name is enough to instantiate a blank actor that
// the wizard will patch piecemeal. Callers can seed `system` as well
// when they already have partial details.
export const createActorBody = z.object({
  name: z.string(),
  type: z.string().min(1),
  folder: z.string().optional(),
  img: z.string().optional(),
  system: z.record(z.string(), z.unknown()).optional(),
});

// Partial-merge update. Any subset of fields can be supplied; Foundry
// does a deep merge on `system`, so patching e.g. `system.details.age`
// leaves every other detail untouched. `flags` follows the same rule —
// patch `flags.<scope>.<key>` to poke one value without losing siblings.
export const updateActorBody = z.object({
  name: z.string().optional(),
  img: z.string().optional(),
  folder: z.string().optional(),
  system: z.record(z.string(), z.unknown()).optional(),
  flags: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

// Item-on-actor operations for the wizard's piecemeal picks
// (ancestry, heritage, class, background, deity). Copies the source
// document out of the compendium, strips its `_id`, and attaches it
// to the target actor.
export const addItemFromCompendiumBody = z.object({
  packId: z.string().min(1),
  itemId: z.string().min(1),
  name: z.string().optional(),
  quantity: z.coerce.number().int().positive().optional(),
  // Pass-through overrides merged into the created item's
  // `system` — used by the creator to tag feats with their
  // `location` slot string.
  systemOverrides: z.record(z.string(), z.unknown()).optional(),
});

export const actorItemIdParams = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
});

// Shallow-merge patch on an embedded item. `system` keys can use
// Foundry dot-notation (e.g. `boosts.2.selected`) to target nested
// fields without clobbering siblings; the module handler applies
// them verbatim through `actor.updateEmbeddedDocuments`.
export const updateActorItemBody = z.object({
  name: z.string().optional(),
  img: z.string().optional(),
  system: z.record(z.string(), z.unknown()).optional(),
});

export const bridgeIdParam = z.object({
  id: z.string().min(1),
});

// Response body the frontend POSTs back to resolve a pending bridge
// event. `value` is echoed verbatim to the module — no schema check
// because the module's caller gets to validate against its own
// domain (e.g. the ChoiceSet prompt matches against its choice list).
export const resolvePromptBody = z.object({
  value: z.unknown(),
});

// POST /api/uploads — deposit a base64-encoded file into the Foundry
// Data directory. Mirrors the `upload_asset` MCP tool shape. `path` is
// relative to the Data dir; the server normalises + rejects anything
// that tries to escape it.
export const uploadAssetBody = z.object({
  path: z.string().min(1),
  dataBase64: z.string().min(1),
});
