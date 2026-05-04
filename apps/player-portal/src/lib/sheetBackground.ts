import type { CSSProperties } from 'react';
import type { PreparedCharacter } from '../api/types';

export function readBackgroundPath(character: PreparedCharacter): string | null {
  const raw = character.flags?.['character-creator']?.['backgroundImage'];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Normalize Windows-style backslashes that may have been stored by an
  // older upload on a Windows host (path.normalize produced \ separators).
  return raw.replace(/\\/g, '/');
}

export function buildSheetSurfaceStyle(bgPath: string | null): CSSProperties | undefined {
  if (!bgPath) return undefined;
  const url = bgPath.startsWith('/') ? bgPath : `/${bgPath}`;
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'local',
  };
}
