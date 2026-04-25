export interface MonsterArtAssets {
  /** Small portrait shown inline — token preferred, full art as fallback. */
  portraitSrc: string | null;
  /** Full art shown on hover. Null when no imageUrl is available. */
  artSrc: string | null;
}

/** Resolve which images to show inline vs on hover.
 *
 *  Priority: token → full art → placeholder (both null).
 */
export function resolveMonsterArtAssets(tokenUrl: string | null, imageUrl: string | null): MonsterArtAssets {
  if (tokenUrl) {
    return { portraitSrc: tokenUrl, artSrc: imageUrl };
  }
  if (imageUrl) {
    return { portraitSrc: imageUrl, artSrc: imageUrl };
  }
  return { portraitSrc: null, artSrc: null };
}
