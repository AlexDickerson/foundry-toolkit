/**
 * Pure display-formatting helpers for the item detail panel.
 * No I/O, no state, no React — testable in isolation.
 */

/**
 * Convert a PF2e usage value to a human-readable string.
 *
 * The Foundry system stores usage as a slug ("held-in-one-hand") or an
 * already-readable string ("held in 1 hand"). Both are handled:
 *   - "held-in-one-hand"  → "held in one hand"
 *   - "worn-headwear"     → "worn (headwear)"
 *   - "worn-gloves"       → "worn (gloves)"
 *   - "held in 1 hand"    → "held in 1 hand"   (no-op, already readable)
 *   - "worn"              → "worn"
 *   - null / ""           → null
 */
export function formatUsage(usage: string | null | undefined): string | null {
  if (!usage) return null;
  // "worn-<slot>" → "worn (<slot with spaces>)"
  const wornMatch = usage.match(/^worn-(.+)$/);
  if (wornMatch) {
    return `worn (${wornMatch[1].replace(/-/g, ' ')})`;
  }
  // Replace any remaining hyphens with spaces (slug → readable)
  return usage.replace(/-/g, ' ');
}

/**
 * Capitalize the first letter of a Foundry item type slug for display.
 *   "weapon"     → "Weapon"
 *   "consumable" → "Consumable"
 *   "armor"      → "Armor"
 *   ""           → ""
 */
export function formatItemType(type: string | null | undefined): string {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}
