// localStorage helpers shared across scroll and zoom modules. Swallows
// SecurityError (sandboxed iframes) and QuotaExceededError silently.

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readNumber(key: string, fallback: number): number {
  const raw = readString(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
