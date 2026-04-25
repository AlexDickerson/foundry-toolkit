// Small presentation helpers used across tabs.

export function formatSignedInt(value: number): string {
  if (value >= 0) return `+${value.toString()}`;
  return value.toString();
}

/**
 * Build the ancestry/heritage identity segment for a character subtitle.
 *
 * Heritage names in PF2e often embed the ancestry name (e.g. "Venom-Resistant
 * Vishkanya", "Ancient Elf"), so naively joining `${heritage} ${ancestry}`
 * duplicates it. This helper suppresses the ancestry suffix when the heritage
 * already contains it as a whole word (case-insensitive).
 *
 * Examples:
 *   ("Venom-Resistant Vishkanya", "Vishkanya") → "Venom-Resistant Vishkanya"
 *   ("Ancient Elf",               "Elf")       → "Ancient Elf"
 *   ("Versatile Human",           "Human")     → "Versatile Human"
 *   ("Aiuvarin",                  "Half-Elf")  → "Aiuvarin Half-Elf"
 *   ("Skilled Heritage",          "Human")     → "Skilled Heritage Human"
 *   (undefined,                   "Human")     → "Human"
 *   ("Skilled Heritage",          undefined)   → "Skilled Heritage"
 *   (undefined,                   undefined)   → ""
 */
export function formatAncestryLine(heritage: string | undefined, ancestry: string | undefined): string {
  if (!heritage && !ancestry) return '';
  if (!heritage) return ancestry ?? '';
  if (!ancestry) return heritage;

  // Escape any regex-special characters in the ancestry name, then match as a
  // whole word so "Elf" doesn't falsely match inside a longer unrelated word.
  const escaped = ancestry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
  if (pattern.test(heritage)) return heritage;

  return `${heritage} ${ancestry}`;
}
