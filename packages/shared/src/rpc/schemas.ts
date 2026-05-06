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

// URL params for the generic outbound-action endpoint. The `action`
// slug is validated as a non-empty identifier but not enumerated
// here — the bridge-side dispatch table is the authority on which
// actions are actually handled, and we want new actions to land as a
// single handler registration without touching the shared schema.
export const actorActionParams = z.object({
  id: z.string().min(1),
  action: z.string().min(1).max(64),
});

// Body for `POST /api/actors/:id/actions/:action`. `params` is the
// action-specific parameter bag; schema is `z.record(z.unknown())`
// because each action interprets its own shape (adjust-resource reads
// `{resource, delta}`, roll-statistic reads `{statistic, rollMode?}`,
// and so on). The bridge handler narrows at runtime using the
// action-specific schemas below.
export const invokeActorActionBody = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
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
  // Zero-based offset for server-side pagination. Combined with `limit`
  // to page through results: offset=0 is the first page, offset=50 is
  // the second (with limit=50), etc. No-op when omitted (returns from
  // the beginning of the sorted result set).
  offset: z.coerce.number().int().nonnegative().optional(),
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
export const EVENT_CHANNELS = ['rolls', 'chat', 'combat', 'actors'] as const;

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

// Steppable numeric fields on an actor. Kept narrow — each key maps
// to a known path under `actor.system` on the module side, with
// resource-specific clamping. New keys require a matching branch
// in the bridge handler (AdjustActorResourceHandler.ts).
export const ACTOR_RESOURCE_KEYS = ['hp', 'hp-temp', 'hero-points', 'focus-points'] as const;

export const adjustActorResourceBody = z.object({
  resource: z.enum(ACTOR_RESOURCE_KEYS),
  // Signed integer delta. Bound is wide enough for "heal to full"
  // on any reasonable HP pool; the handler clamps to [0, max] so
  // oversized requests are harmless.
  delta: z.number().int().min(-10_000).max(10_000),
});

// PF2e persistent conditions that carry a stack count. Handler goes
// through `actor.increaseCondition` / `decreaseCondition` (not raw
// updates) so the system's cascade rules fire — dying crossing its
// cap kills the character, dying decreasing past 0 leaves a wounded
// stack behind.
export const ACTOR_CONDITION_KEYS = ['dying', 'wounded', 'doomed'] as const;

export const adjustActorConditionBody = z.object({
  condition: z.enum(ACTOR_CONDITION_KEYS),
  // Each unit of |delta| maps to one increase/decrease call. Kept
  // small because nobody clicks +10 dying in practice, and small
  // deltas keep the lifecycle cascade predictable.
  delta: z.number().int().min(-10).max(10),
});

// Slugs resolvable by PF2e's unified `actor.getStatistic()` accessor:
// Perception, the three saves, and every skill. Mirrored on the bridge
// side — any additions need the UI to know what it's offering anyway.
export const PF2E_STATISTIC_SLUGS = [
  'perception',
  'fortitude',
  'reflex',
  'will',
  'acrobatics',
  'arcana',
  'athletics',
  'crafting',
  'deception',
  'diplomacy',
  'intimidation',
  'medicine',
  'nature',
  'occultism',
  'performance',
  'religion',
  'society',
  'stealth',
  'survival',
  'thievery',
] as const;

export const PF2E_ROLL_MODES = ['publicroll', 'gmroll', 'blindroll', 'selfroll'] as const;

export const rollActorStatisticBody = z.object({
  statistic: z.enum(PF2E_STATISTIC_SLUGS),
  rollMode: z.enum(PF2E_ROLL_MODES).optional(),
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

/** Query params for `GET /api/actors/party`.  `party` overrides the
 *  default party actor name defined in `apps/foundry-api-bridge/src/party-config.ts`
 *  ("The Party").  Only needed when the PF2e party actor has been renamed. */
export const partyActorsQuery = z.object({
  party: z.string().min(1).optional(),
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

// ---------------------------------------------------------------------------
// Homebrew item creator (dm-tool's Item Browser → Create)
// ---------------------------------------------------------------------------

// World pack scope-less name. Foundry composes the actual id as
// `world.<name>`, so `name` must be safe for that key — lowercase
// kebab-case, no dots. The bridge also enforces this.
const packShortName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'pack name must be lowercase kebab-case (a-z, 0-9, -)');

// POST /api/compendium/packs/ensure — idempotent create of a world pack.
// `name` is the scope-less short name; the bridge prefixes `world.` to
// build the full id. `label` is the display name shown in the Foundry
// sidebar. `type` is fixed to 'Item' for now — the editor only creates
// items, and constraining the schema means a misuse 400s rather than
// silently producing an Actor pack the consumer can't write to.
export const ensureCompendiumPackBody = z.object({
  name: packShortName,
  label: z.string().min(1).max(128),
  type: z.literal('Item').optional(),
});

// One ActiveEffect change row. Mirrors Foundry's
// `ActiveEffectData.changes` shape — `mode` is one of the numeric
// CONST.ACTIVE_EFFECT_MODES values (0=custom, 1=multiply, 2=add,
// 3=downgrade, 4=upgrade, 5=override). `priority` is optional and
// defaults to mode * 10 in Foundry.
export const activeEffectChange = z.object({
  key: z.string().min(1),
  mode: z.number().int().min(0).max(5),
  value: z.string(),
  priority: z.number().int().optional(),
});

// One ActiveEffect document. Kept minimal — the editor writes name,
// changes, transfer, disabled, duration, and an optional icon. The
// bridge passes the object through to `pack.documentClass.create`'s
// `effects` array verbatim.
export const activeEffectPayload = z.object({
  name: z.string().min(1),
  img: z.string().optional(),
  disabled: z.boolean().optional(),
  // ActiveEffect transfer flag — when true on an item, applying the
  // item to an actor copies the effect onto the actor. PF2e mostly
  // uses RuleElements (system.rules) for this, but vanilla
  // ActiveEffects still work.
  transfer: z.boolean().optional(),
  changes: z.array(activeEffectChange).optional(),
  duration: z
    .object({
      seconds: z.number().int().nonnegative().optional(),
      rounds: z.number().int().nonnegative().optional(),
      turns: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

// Item document payload accepted by `create-compendium-item`. `system`
// is opaque (`Record<string, unknown>`) because each pf2e item type
// has a different shape and the editor knows the difference; the
// bridge writes `system` verbatim. `effects` is a parallel array of
// embedded ActiveEffect docs (Foundry handles `effects` as embedded
// documents on Item.create). `flags` is left open for future
// callers (module-scoped flags, source attribution, etc.).
export const compendiumItemPayload = z.object({
  name: z.string().min(1).max(256),
  type: z.string().min(1).max(64),
  img: z.string().optional(),
  system: z.record(z.string(), z.unknown()),
  effects: z.array(activeEffectPayload).optional(),
  flags: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

// POST /api/compendium/items — create a single Item document in a
// world pack. The bridge resolves `packId` against `game.packs`, errors
// if it doesn't exist or isn't an Item pack, and returns the new
// document's id + uuid. Use `ensureCompendiumPackBody` first to
// guarantee the pack exists.
export const createCompendiumItemBody = z.object({
  packId: z.string().min(1),
  item: compendiumItemPayload,
});
