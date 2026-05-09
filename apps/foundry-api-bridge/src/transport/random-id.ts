// Random ID generator for short-lived bridge correlation IDs.
//
// crypto.randomUUID requires a secure context (HTTPS or localhost). When
// Foundry is served over plain HTTP from a non-localhost host (e.g.
// http://server.ad:30000) the Web Crypto API is unavailable and the call
// throws. We fall back to a Math.random-based UUID v4 — collision
// probability is irrelevant for correlation IDs that live for seconds.

export function generateRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // crypto.randomUUID exists but throws (some non-secure contexts).
      // Fall through to the Math.random path.
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
