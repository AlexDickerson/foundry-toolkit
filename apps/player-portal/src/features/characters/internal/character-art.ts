// Reference art for the character creator's ancestry and class detail panels.
// Lookup is by display name (e.g. "Dwarf", "Magus") because that's what
// CompendiumMatch.name carries; we can't rely on system.slug being on the
// match payload.
//
// Image URLs are public Archives of Nethys hosts (https://2e.aonprd.com/...).
// Browsers load them cross-origin via <img>; AoN does not block hotlinking.
// The data is purely decorative — no character-data is derived from it.

import artDataJson from './pf2e-art.json';

export interface CharacterArt {
  /** Archives of Nethys numeric id for the source page. */
  id: number;
  /** Link to the AoN reference page (shown as a credit / "see more"). */
  url: string;
  /** Direct image URLs to render. Empty array when AoN has no art on file. */
  images: string[];
  /** Convenience: images.length. */
  count: number;
}

interface ArtData {
  ancestries: Record<string, CharacterArt>;
  classes: Record<string, CharacterArt>;
}

const artData: ArtData = artDataJson;

export function getAncestryArt(name: string): CharacterArt | null {
  return lookup(artData.ancestries, name);
}

export function getClassArt(name: string): CharacterArt | null {
  return lookup(artData.classes, name);
}

// Heritage art is stored alongside ancestry art in pf2e-art.json because
// versatile heritages (Aiuvarin, Changeling, Beastkin, etc.) are indexed by
// their own name, not by their parent ancestry.
export function getHeritageArt(name: string): CharacterArt | null {
  return lookup(artData.ancestries, name);
}

function lookup(table: Record<string, CharacterArt>, name: string): CharacterArt | null {
  // Exact match first — covers the vast majority of cases.
  const direct = table[name];
  if (direct && direct.images.length > 0) return direct;

  // Case-insensitive fallback so a slug-cased input still resolves.
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(table)) {
    if (key.toLowerCase() === target && value.images.length > 0) return value;
  }
  return null;
}
