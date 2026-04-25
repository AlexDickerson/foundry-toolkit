/**
 * Format and filter the `skills` field from a `MonsterDetail`.
 *
 * Skills arrive in one of two shapes:
 *  - Legacy DB path: a JSON object string `{"stealth":12,"athletics":0}`.
 *  - Current compendium-projection path: a plain comma-separated string
 *    `"Stealth +12, Athletics +0, Arcana +8"` produced by `monsterSkills()`.
 *
 * In both cases skills whose modifier is exactly +0 are omitted — they add
 * no meaningful information to the stat block display.
 */
export function formatSkills(raw: string): string {
  if (!raw) return '';
  try {
    // JSON path (legacy DB): {"stealth":12,"athletics":0}
    const obj: Record<string, number> = JSON.parse(raw) as Record<string, number>;
    return Object.entries(obj)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v >= 0 ? '+' : ''}${v}`)
      .join(', ');
  } catch {
    // Plain string path: "Stealth +12, Athletics +0, Arcana +8"
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((entry) => {
        const parts = entry.split(/\s+/);
        const mod = parts[parts.length - 1];
        return mod !== '+0';
      })
      .join(', ');
  }
}
