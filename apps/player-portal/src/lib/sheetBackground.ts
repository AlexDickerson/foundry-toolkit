import type { CSSProperties } from 'react';
import type { PreparedCharacter } from '../api/types';

export function readBackgroundPath(character: PreparedCharacter): string | null {
  const raw = character.flags?.['character-creator']?.['backgroundImage'];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Normalize Windows-style backslashes that may have been stored by an
  // older upload on a Windows host (path.normalize produced \ separators).
  return raw.replace(/\\/g, '/');
}

// Layers a semi-transparent overlay on top of the user's image so arbitrary
// artwork (dark, busy, saturated) stays readable behind the sheet content.
// Uses var(--pf-bg-overlay) so the overlay colour follows the portal theme
// toggle (light: cream parchment at 88%, dark: navy at 88%).
export function buildSheetSurfaceStyle(bgPath: string | null): CSSProperties | undefined {
  if (!bgPath) return undefined;
  const url = bgPath.startsWith('/') ? bgPath : `/${bgPath}`;
  return {
    backgroundImage: `linear-gradient(var(--pf-bg-overlay), var(--pf-bg-overlay)), url(${url})`,
    backgroundSize: 'auto, cover',
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
    backgroundAttachment: 'local, local',
  };
}
