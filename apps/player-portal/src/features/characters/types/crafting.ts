// Formula book entry. pf2e stores these as compendium UUID references on
// `system.crafting.formulas`; the item itself isn't owned by the actor,
// just recorded as "known". `batch` overrides the default batch size for
// consumables; `expended` tracks per-day usage for magical crafting.
export interface CraftingFormulaEntry {
  uuid: string;
  batch?: number;
  expended?: { nth?: number; day?: string } | null;
}

// A formula prepared into a crafting ability's slot (alchemist infused
// reagent, herbalist remedy, etc.). Matches pf2e's `PreparedFormulaData`
// on the upstream actor. `expended` tracks whether the slot has been
// consumed today; `isSignatureItem` flags an alchemist's chosen
// signature item for free heightening.
export interface PreparedFormulaData {
  uuid: string;
  quantity?: number;
  expended?: boolean;
  isSignatureItem?: boolean;
}

// A crafting ability on a character (pf2e's `CraftingAbilityData`),
// keyed by slug in `system.crafting.entries`. Represents a class/feat
// that grants crafting: alchemist's "Infused Reagents", herbalist's
// remedies, magical crafting, etc. `fieldDiscovery` and `craftableItems`
// carry predicate data we don't render yet — kept loose.
export interface CraftingAbilityData {
  slug: string;
  label: string;
  resource: string | null;
  isAlchemical: boolean;
  isDailyPrep: boolean;
  isPrepared: boolean;
  maxSlots: number | null;
  batchSize: number;
  maxItemLevel: number;
  preparedFormulaData: PreparedFormulaData[];
  fieldDiscovery?: unknown;
  fieldDiscoveryBatchSize?: number;
  craftableItems?: unknown[];
}

export interface CraftingField {
  formulas: CraftingFormulaEntry[];
  // Crafting abilities keyed by slug. Each ability tracks its own
  // prepared-formula list plus metadata (daily prep, alchemical,
  // max item level, etc.). Shape matches pf2e's `CraftingAbilityData`.
  entries: Record<string, CraftingAbilityData>;
}
