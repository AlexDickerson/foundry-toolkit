import type { ActorActionState } from '../../../lib/useActorAction';
import type { CharacterSystem } from '../../../api/types';

export function firstError(...states: ActorActionState[]): string | null {
  for (const s of states) {
    if (typeof s === 'object') return s.error;
  }
  return null;
}

export function primarySpeed(speeds: CharacterSystem['movement']['speeds']): string {
  const land = speeds.land;
  if (land) return `${land.value.toString()} ft`;
  const entries = Object.values(speeds);
  const first = entries[0];
  return first ? `${first.value.toString()} ft` : '—';
}

export function humaniseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
