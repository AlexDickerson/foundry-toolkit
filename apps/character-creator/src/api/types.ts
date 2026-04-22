// Types for the foundry-mcp REST API surface.
//
// Kept deliberately minimal: we type the slice of `system.*` that the
// active tab actually reads. `PreparedActor.system` stays as
// `Record<string, unknown>` generically; narrower actor types like
// `PreparedCharacter` type the fields we consume.

export interface ActorSummary {
  id: string;
  name: string;
  type: string;
  img: string;
}

// Narrow result shape returned by create-actor / update-actor — just
// enough to thread the new id back to the caller and to log a name /
// folder change. The full actor is re-fetched via /api/actors/:id/
// prepared when the caller actually needs to render it.
export interface ActorRef {
  id: string;
  uuid: string;
  name: string;
  type: string;
  img: string;
  folder: string | null;
}

// Result shape for add-item-from-compendium. Returns the newly-
// created embedded item id so the wizard can remember which item to
// delete when the user changes their pick.
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

export interface ApiError {
  error: string;
  suggestion?: string;
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
  /** Full `system.*` slice. Shape varies by item type; the picker's
   *  detail renderer reads description / level / traits / prerequisites
   *  defensively. */
  system: Record<string, unknown>;
}

// ─── PF2e character-specific shapes (used by the Proficiencies tab) ────

export type ProficiencyRank = 0 | 1 | 2 | 3 | 4;

export type ModifierKind = 'modifier' | 'bonus' | 'penalty';

export interface Modifier {
  slug: string;
  label: string;
  modifier: number;
  type: string;
  enabled: boolean;
  ignored: boolean;
  kind: ModifierKind;
  hideIfDisabled?: boolean;
}

export interface SkillStatistic {
  slug: string;
  label: string;
  value: number;
  totalModifier: number;
  dc: number;
  breakdown: string;
  modifiers: Modifier[];
  rank: ProficiencyRank;
  attribute: string;
  armor?: boolean;
  itemId?: string | null;
  lore?: boolean;
}

export interface MartialProficiency {
  rank: ProficiencyRank;
  value: number;
  breakdown: string;
  visible?: boolean;
  custom?: boolean;
  label?: string;
}

export interface ClassDC {
  slug: string;
  label: string;
  rank: ProficiencyRank;
  attribute: string;
  primary: boolean;
  value: number;
  totalModifier: number;
  dc: number;
  breakdown: string;
  modifiers: Modifier[];
}

export interface SpellcastingProficiency {
  rank: ProficiencyRank;
}

// ─── Character landing-tab fields ──────────────────────────────────────

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITY_KEYS: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export interface Ability {
  mod: number;
  base: number;
  label: string; // i18n key, e.g. "PF2E.AbilityStr"
  shortLabel: string; // i18n key, e.g. "PF2E.AbilityId.str"
}

export interface HPAttribute {
  value: number;
  max: number;
  temp: number;
  totalModifier: number;
  breakdown: string;
}

export interface ACAttribute {
  value: number;
  totalModifier: number;
  dc: number;
  breakdown: string;
  attribute: string;
}

export interface Perception {
  slug: string;
  label: string;
  value: number;
  totalModifier: number;
  dc: number;
  rank: ProficiencyRank;
  attribute: string;
  breakdown: string;
  modifiers: Modifier[];
}

export interface Save {
  slug: string;
  label: string;
  value: number;
  totalModifier: number;
  dc: number;
  rank: ProficiencyRank;
  attribute: string;
  breakdown: string;
  modifiers: Modifier[];
}

export interface HeroPoints {
  value: number;
  max: number;
}

export interface PointPool {
  value: number;
  max: number;
}

export interface FocusPool {
  value: number;
  max: number;
  cap: number;
}

export interface Dying {
  value: number;
  max: number;
  recoveryDC: number;
}

export interface Wounded {
  value: number;
  max: number;
}

export interface Doomed {
  value: number;
  max: number;
}

export interface Initiative {
  slug: string;
  label: string;
  value: number;
  totalModifier: number;
  breakdown: string;
  statistic: string;
  tiebreakPriority: number;
}

// PF2e immunities/weaknesses/resistances share a near-identical shape.
// `value` is absent on immunities, present (numeric) on weaknesses/resistances.
export interface IWREntry {
  type: string;
  value?: number;
  exceptions?: string[];
  doubleVs?: string[];
  source?: string;
}

export interface Shield {
  itemId: string | null;
  name: string; // i18n key or literal (e.g. "PF2E.ArmorTypeShield")
  ac: number;
  hp: { value: number; max: number };
  brokenThreshold: number;
  hardness: number;
  raised: boolean;
  broken: boolean;
  destroyed: boolean;
  icon: string;
}

export interface Reach {
  base: number;
  manipulate: number;
}

export interface BiographyVisibility {
  appearance: boolean;
  backstory: boolean;
  personality: boolean;
  campaign: boolean;
}

// pf2e actor biography block (system.details.biography). HTML fields
// (appearance, backstory, campaignNotes) are raw HTML strings as stored
// in Foundry; we render them via dangerouslySetInnerHTML because the
// source is our own self-hosted Foundry instance.
export interface CharacterBiography {
  appearance: string;
  backstory: string;
  birthPlace: string;
  attitude: string;
  beliefs: string;
  anathema: string[];
  edicts: string[];
  likes: string;
  dislikes: string;
  catchphrases: string;
  campaignNotes: string;
  allies: string;
  enemies: string;
  organizations: string;
  visibility: BiographyVisibility;
}

export interface DemographicField {
  value: string;
}

export interface Speed {
  type: string;
  slug: string;
  label: string;
  value: number;
  base: number;
  breakdown: string;
}

// Foundry ships every speed slot; unpopulated ones are null.
export interface Movement {
  speeds: {
    land: Speed | null;
    burrow: Speed | null;
    climb: Speed | null;
    fly: Speed | null;
    swim: Speed | null;
    travel?: Speed | null;
  };
}

export interface CharacterTraits {
  value: string[]; // trait slugs like "human", "humanoid"
  rarity: string;
  size: { value: string; long: number; wide: number };
}

export interface CharacterDetails {
  level: { value: number };
  xp: { value: number; min: number; max: number; pct: number };
  keyability: { value: AbilityKey };
  languages: { value: string[]; details: string };
  ancestry: { name: string; trait: string | null } | null;
  heritage: { name: string; trait: string | null } | null;
  class: { name: string; trait: string | null } | null;
  background?: { name: string } | null;
  deity?: { image?: string; value?: string } | null;
  biography: CharacterBiography;
  age: DemographicField;
  height: DemographicField;
  weight: DemographicField;
  gender: DemographicField;
  ethnicity: DemographicField;
  nationality: DemographicField;
  alliance: 'party' | 'opposition' | null;
}

export interface CharacterSystem {
  abilities: Record<AbilityKey, Ability>;
  attributes: {
    ac: ACAttribute;
    hp: HPAttribute;
    classDC: ClassDC | null;
    dying: Dying;
    wounded: Wounded;
    doomed: Doomed;
    immunities: IWREntry[];
    weaknesses: IWREntry[];
    resistances: IWREntry[];
    shield: Shield;
    reach: Reach;
    handsFree: number;
  };
  details: CharacterDetails;
  initiative: Initiative;
  perception: Perception;
  resources: {
    heroPoints: HeroPoints;
    focus: FocusPool;
    investiture: PointPool;
    mythicPoints: PointPool;
  };
  movement: Movement;
  traits: CharacterTraits;
  saves: Record<'fortitude' | 'reflex' | 'will', Save>;
  skills: Record<string, SkillStatistic>;
  proficiencies: {
    attacks: Record<string, MartialProficiency>;
    defenses: Record<string, MartialProficiency>;
    classDCs: Record<string, ClassDC>;
    spellcasting: SpellcastingProficiency;
  };
  actions: Strike[];
}

// ─── Actions/Strikes (Actions tab) ─────────────────────────────────────

export interface StrikeVariant {
  label: string; // e.g. "+7", "+3 (MAP -4)", "-1 (MAP -8)"
}

export interface StrikeTrait {
  name: string;
  label: string;
  description?: string;
}

export interface StrikeItemSource {
  _id: string;
  img: string;
  name: string;
  type: string;
  system: {
    damage?: { dice: number; die: string; damageType: string };
    range?: number | null;
    traits?: { value: string[]; rarity: string };
  };
}

export interface Strike {
  slug: string;
  label: string;
  totalModifier: number;
  quantity: number;
  ready: boolean;
  visible: boolean;
  glyph: string;
  type: string; // usually 'strike'
  item: StrikeItemSource;
  description?: string;
  options?: string[];
  traits: StrikeTrait[];
  weaponTraits: StrikeTrait[];
  variants: StrikeVariant[];
  canAttack: boolean;
}

// ─── Feats (Feats tab) ─────────────────────────────────────────────────

// Common categories are 'ancestry' | 'class' | 'classfeature' | 'skill' |
// 'general' | 'bonus' | 'pfsboon'. Kept as `string` so custom categories
// from modules or future pf2e updates don't fail the type.
export type FeatCategory = string;

export interface FeatItemSystem {
  slug: string | null;
  level: { value: number; taken?: number | null };
  category: FeatCategory;
  traits: { value: string[]; rarity: string; otherTags?: string[] };
  prerequisites?: { value: Array<{ value: string }> };
  description?: { value: string };
  location?: string | null;
  // Index signature lets FeatItem be a subtype of PreparedActorItem
  // (whose `system` is Record<string, unknown>) while keeping the
  // declared fields above strongly typed at consumer sites.
  [key: string]: unknown;
}

export interface FeatItem {
  id: string;
  name: string;
  type: 'feat';
  img: string;
  system: FeatItemSystem;
}

export function isFeatItem(item: PreparedActorItem): item is FeatItem {
  return item.type === 'feat';
}

// ─── Action items (Actions tab, non-strike) ────────────────────────────

export type ActionKind = 'action' | 'reaction' | 'free' | 'passive';

export interface ActionItemSystem {
  slug: string | null;
  actionType: { value: ActionKind };
  actions: { value: number | null }; // 1-3 for "action", null for "reaction"/"free"/"passive"
  category?: string; // "offensive" | "defensive" | "interaction" | ...
  description?: { value: string };
  traits: { value: string[]; rarity?: string; otherTags?: string[] };
  frequency?: unknown;
  selfEffect?: unknown;
  [key: string]: unknown;
}

export interface ActionItem {
  id: string;
  name: string;
  type: 'action';
  img: string;
  system: ActionItemSystem;
}

export function isActionItem(item: PreparedActorItem): item is ActionItem {
  return item.type === 'action';
}

// ─── Class item (Progression tab) ──────────────────────────────────────

// pf2e's class item embeds the entire level-by-level feature progression
// and the level arrays for each feat/skill slot. `system.items` is an
// object map keyed by opaque short ids; entries describe the features
// auto-granted at their `level`. The feat-level arrays list which levels
// open a given slot type.
export interface ClassFeatureEntry {
  uuid: string;
  name: string;
  img: string;
  level: number;
}

export interface ClassItemSystem {
  slug: string | null;
  description?: { value: string };
  items: Record<string, ClassFeatureEntry>;
  keyAbility: { value: AbilityKey[] };
  hp: number;
  ancestryFeatLevels: { value: number[] };
  classFeatLevels: { value: number[] };
  generalFeatLevels: { value: number[] };
  skillFeatLevels: { value: number[] };
  skillIncreaseLevels: { value: number[] };
  [key: string]: unknown;
}

export interface ClassItem {
  id: string;
  name: string;
  type: 'class';
  img: string;
  system: ClassItemSystem;
}

export function isClassItem(item: PreparedActorItem): item is ClassItem {
  return item.type === 'class';
}

// ─── Inventory tab (physical items) ────────────────────────────────────

export type CarryType = 'worn' | 'held' | 'stowed' | 'dropped';

export interface ItemEquipped {
  carryType: CarryType;
  handsHeld?: number;
  invested?: boolean | null;
  inSlot?: boolean;
}

export interface ItemBulk {
  value: number;
  heldOrStowed?: number;
  per?: number;
  capacity?: number; // containers only
  ignored?: number; // containers only — bulk that doesn't count toward carry limit
}

export interface ItemPrice {
  value: { pp?: number; gp?: number; sp?: number; cp?: number };
  per?: number;
}

// Union of fields across physical item subtypes. Specific item types
// (weapon / armor / consumable / etc.) add their own fields on top;
// callers narrow via `item.type`. Index signature lets this subtype
// PreparedActorItem.system cleanly.
export interface PhysicalItemSystem {
  slug: string | null;
  level: { value: number };
  quantity: number;
  bulk: ItemBulk;
  equipped: ItemEquipped;
  containerId: string | null;
  traits: { value: string[]; rarity: string; otherTags?: string[] };
  price?: ItemPrice;
  description?: { value: string };
  category?: string; // "coin" on treasure, "medium" on armor, "martial" on weapon, "potion" on consumable, ...
  damage?: { dice: number; die: string; damageType: string };
  acBonus?: number;
  strength?: number;
  dexCap?: number;
  checkPenalty?: number;
  speedPenalty?: number;
  uses?: { value: number; max: number; autoDestroy?: boolean };
  [key: string]: unknown;
}

export type PhysicalItemType = 'weapon' | 'armor' | 'equipment' | 'consumable' | 'treasure' | 'backpack';

export interface PhysicalItem {
  id: string;
  name: string;
  type: PhysicalItemType;
  img: string;
  system: PhysicalItemSystem;
}

const PHYSICAL_ITEM_TYPES: readonly PhysicalItemType[] = [
  'weapon',
  'armor',
  'equipment',
  'consumable',
  'treasure',
  'backpack',
];

export function isPhysicalItem(item: PreparedActorItem): item is PhysicalItem {
  return (PHYSICAL_ITEM_TYPES as readonly string[]).includes(item.type);
}

export function isCoin(item: PhysicalItem): boolean {
  return item.type === 'treasure' && item.system.category === 'coin';
}

export function isContainer(item: PhysicalItem): boolean {
  return item.type === 'backpack';
}

// ─── Spellcasting (Spells tab) ─────────────────────────────────────────

export type SpellPreparationMode = 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'ritual' | 'items';
export type SpellTradition = 'arcane' | 'divine' | 'occult' | 'primal';

export interface SpellcastingEntrySlot {
  max: number;
  value?: number;
  prepared?: Array<{ id: string | null; expended?: boolean }>;
}

export interface SpellcastingEntryItemSystem {
  slug: string | null;
  prepared: { value: SpellPreparationMode; flexible?: boolean };
  tradition: { value: SpellTradition | '' };
  ability?: { value: AbilityKey };
  slots?: Record<string, SpellcastingEntrySlot>;
  proficiency?: { value: number };
  [key: string]: unknown;
}

export interface SpellcastingEntryItem {
  id: string;
  name: string;
  type: 'spellcastingEntry';
  img: string;
  system: SpellcastingEntryItemSystem;
}

export function isSpellcastingEntryItem(item: PreparedActorItem): item is SpellcastingEntryItem {
  return item.type === 'spellcastingEntry';
}

export interface SpellHeightening {
  // 'interval': each +N steps above base rank applies `damage` / `area` /
  // etc. once more. 'fixed': explicit per-rank overrides in `levels`.
  type?: 'interval' | 'fixed';
  interval?: number;
  // Keyed by partition id; values are dice expressions ("2d6") applied
  // per step. pf2e sometimes emits entries for non-damage scalars
  // alongside real dice — the reader filters those out.
  damage?: Record<string, string>;
  levels?: Record<string, unknown>;
}

export interface SpellItemSystem {
  slug: string | null;
  // Base rank of the spell. Cantrips also carry the `cantrip` trait —
  // use that, not `level.value`, to tell cantrips apart from rank-1
  // spells (cantrips heighten automatically at cast time).
  level: { value: number };
  traits: { value: string[]; rarity: string; traditions?: string[] };
  description?: { value: string };
  // Back-reference to the owning spellcastingEntry by id. May be absent
  // or dangling on orphaned imports.
  location?: { value: string | null; heightenedLevel?: number | null };
  // Action cost string. pf2e uses "1"/"2"/"3" for 1/2/3-action casts,
  // "reaction"/"free" for those, and free-form like "1 minute" or
  // "10 minutes" for longer castings.
  time?: { value: string };
  range?: { value: string };
  area?: { type?: string; value?: number | string } | null;
  target?: { value: string };
  heightening?: SpellHeightening;
  [key: string]: unknown;
}

export interface SpellItem {
  id: string;
  name: string;
  type: 'spell';
  img: string;
  system: SpellItemSystem;
}

export function isSpellItem(item: PreparedActorItem): item is SpellItem {
  return item.type === 'spell';
}

export function isCantripSpell(spell: SpellItem): boolean {
  const traits = spell.system.traits.value;
  return traits.includes('cantrip');
}

export interface PreparedCharacter {
  id: string;
  uuid: string;
  name: string;
  type: 'character';
  img: string;
  system: CharacterSystem;
  items: PreparedActorItem[];
}
