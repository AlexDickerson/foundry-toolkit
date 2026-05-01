// ---------------------------------------------------------------------------
// Party inventory (live-synced via foundry-mcp)
// ---------------------------------------------------------------------------

export type PartyInventoryCategory = 'consumable' | 'equipment' | 'quest' | 'treasure' | 'other';

export interface PartyInventoryItem {
  id: string;
  name: string;
  qty: number;
  category: PartyInventoryCategory;
  bulk?: number;
  /** Price of a single unit in copper pieces. Multiply by qty for total value. */
  valueCp?: number;
  /** Link to the Archives of Nethys entry, if known. */
  aonUrl?: string;
  note?: string;
  /** Who's carrying this — character name, "Party" for shared, or undefined. */
  carriedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Aurus leaderboard (live-synced via foundry-mcp)
// ---------------------------------------------------------------------------

export interface AurusTeam {
  id: string;
  name: string;
  /** Free-text emblem descriptor (could become a game-icons name later). */
  emblem?: string;
  /** CSS color string for the team banner stripe. */
  color: string;
  /** Open-ended combat rating. DM-adjusted; no implicit ceiling. */
  combatPower: number;
  /** Total loot recovered, in copper pieces. */
  valueReclaimedCp: number;
  /** Exactly one team should be flagged true; the player portal highlights it. */
  isPlayerParty: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Party members (Foundry live query)
// ---------------------------------------------------------------------------

/** A player character fetched from the GM's party folder in Foundry.
 *  Stats are pre-extracted for the combat tracker so the picker
 *  can display them without a follow-up actor fetch. */
export interface PartyMember {
  id: string;
  name: string;
  img: string;
  /** Perception modifier (PF2e `system.perception.mod`), used as the
   *  default initiative modifier in the combat tracker. */
  initiativeMod: number;
  /** Current HP at the time the picker fetched the party. The combat
   *  tracker uses this as the combatant's starting HP so a PC mid-fight
   *  isn't reset to full when added to the encounter. */
  hp: number;
  maxHp: number;
}
