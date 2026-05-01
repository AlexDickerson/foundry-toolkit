// ---------------------------------------------------------------------------
// Combat tracker
// ---------------------------------------------------------------------------

export type LootKind = 'currency' | 'item' | 'consumable' | 'narrative';
export type LootSource = 'db' | 'ai' | 'manual';

export interface LootItem {
  id: string;
  name: string;
  /** Short description or flavor text — one or two sentences from the AI,
   *  or a DM-authored note for manual entries. */
  description: string;
  kind: LootKind;
  /** Unit value in copper pieces (multiply by qty for total value). */
  valueCp?: number;
  qty: number;
  /** pf2e-db `items.id` when this row was drawn from the database. Lets the
   *  "send to inventory" action link back to a known item for stats. */
  itemId?: string;
  /** Canonical Archives of Nethys page for the item, when known. */
  aonUrl?: string;
  /** Where this row came from — distinguishes AI-invented from DB-drawn
   *  items in the UI so the DM can audit before committing. */
  source: LootSource;
}

export type CombatantKind = 'monster' | 'pc';

export interface Combatant {
  /** Stable UUID within this encounter — used as React key and for edits. */
  id: string;
  kind: CombatantKind;
  /** Exact monster name from pf2e-db. Only present for kind='monster' — used
   *  to refetch the full stat block on demand. */
  monsterName?: string;
  /** Rendered name. Auto-numbered ("Goblin 1", "Goblin 2") when multiple of
   *  the same monster are added, but freely editable by the DM. */
  displayName: string;
  /** Initiative modifier (Perception for monsters by default). Used for the
   *  auto-roll button and kept as the tiebreaker when two combatants roll
   *  the same total. */
  initiativeMod: number;
  /** Rolled initiative total. null before the encounter has been rolled —
   *  unrolled combatants sort to the end of the order. */
  initiative: number | null;
  hp: number;
  maxHp: number;
  /** Free-form conditions / status notes. */
  notes?: string;
  /** Foundry actor document id. Set only when the PC was added from the party
   *  picker (where we have the live actor id). Absent for manually-entered PCs
   *  and monsters. Required by the spell cast + slot display features, the
   *  live HP sync via the `actors` SSE channel, and to match incoming
   *  `updateCombatant` SSE events so the tracker updates automatically when
   *  a player rolls initiative in Foundry. */
  foundryActorId?: string;
}

/** Payload pushed from the Electron main process to the renderer whenever
 *  a Foundry actor changes via the `actors` SSE channel. `changedPaths` is
 *  the dot-notation diff from the `updateActor` hook; `system` is the full
 *  PF2e `actor.getRollData()` snapshot at the time of the event. Renderer
 *  hooks filter by path and extract the fields they care about. */
export interface ActorUpdate {
  actorId: string;
  changedPaths: string[];
  system: Record<string, unknown>;
}

/** Payload pushed over IPC when Foundry fires an updateCombatant hook that
 *  sets a new initiative value. The dm-tool main process subscribes to the
 *  foundry-mcp `combat` SSE channel and forwards these to the renderer. */
export interface CombatantInitiativeEvent {
  /** Foundry combat encounter id (for debugging/logging). */
  encounterId: string;
  /** Foundry actor id — matches `Combatant.foundryActorId`. */
  actorId: string;
  /** The newly-rolled initiative total. */
  initiative: number;
}

/** One monster combatant successfully turned into a Foundry actor. */
export interface PushedActorSummary {
  displayName: string;
  monsterName: string;
  actorId: string;
  actorName: string;
  actorUuid: string;
  sourcePackId: string;
  sourcePackLabel: string;
}

/** One combatant we couldn't push — either no compendium hit, no monsterName,
 *  or Foundry rejected the create. */
export interface SkippedCombatantSummary {
  displayName: string;
  monsterName?: string;
  reason: string;
}

export interface PushEncounterResult {
  /** Folder the actors were placed in. null when nothing was pushed. */
  folderId: string | null;
  folderName: string | null;
  /** True when a new folder was created; false when an existing one was
   *  reused (re-push of the same encounter name). */
  folderCreated: boolean;
  created: PushedActorSummary[];
  skipped: SkippedCombatantSummary[];
}

export interface Encounter {
  id: string;
  name: string;
  combatants: Combatant[];
  /** Index into combatants[] (sorted-order, see below) pointing at whose
   *  turn it currently is. Bounds-checked against combatants.length by the
   *  UI — persisted as-is. */
  turnIndex: number;
  /** 1-indexed round counter, incremented when the turn pointer wraps. */
  round: number;
  /** Treasure awarded for this encounter. Populated manually or via the
   *  AI auto-generate button. */
  loot: LootItem[];
  /** When true, the AI is allowed to self-author up to ~20% of the loot;
   *  the rest must be drawn from pf2e-db items. When false, every row must
   *  come from the DB. */
  allowInventedItems: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Spell cast + slot display (combat panel)
// ---------------------------------------------------------------------------

export type SpellPreparationMode = 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'ritual' | 'items';

export interface CombatSpellSummary {
  id: string;
  name: string;
  /** Base spell rank (0 = cantrip). */
  rank: number;
  isCantrip: boolean;
  /** PF2e action cost string: "1" | "2" | "3" | "reaction" | "free" | etc. */
  actions: string;
  /** Prepared mode only — true when this prepared slot has been expended today. */
  expended?: boolean;
  /** Trait slugs (cantrip excluded). Used for hover card display. */
  traits: string[];
  /** Plain-text range string, e.g. "30 feet". Empty string when absent. */
  range: string;
  /** Plain-text area string, e.g. "15-foot cone". Empty string when absent. */
  area: string;
  /** Plain-text targets string. Empty string when absent. */
  target: string;
  /** Plain text description (Foundry markup stripped). May be empty. */
  description: string;
}

/** Per-rank slot count for spontaneous casters. */
export interface CombatSpellSlot {
  rank: number;
  value: number;
  max: number;
}

export interface CombatSpellEntry {
  id: string;
  name: string;
  mode: SpellPreparationMode;
  tradition: string;
  spells: CombatSpellSummary[];
  /** Spontaneous only — slot state per rank, ranks with max=0 omitted. */
  slots?: CombatSpellSlot[];
  /** Focus only — shared focus point pool. */
  focusPoints?: { value: number; max: number };
}

export interface ActorSpellcasting {
  actorId: string;
  entries: CombatSpellEntry[];
}
