// Unit tests for the monster IPC helpers that don't require a live
// Electron environment. `toMonsterFileUrl` is the pure URL-rewrite
// function used before returning MonsterDetail to the renderer.

import { describe, expect, it } from 'vitest';
import { toMonsterFileUrl } from './monsters';

describe('toMonsterFileUrl', () => {
  it('converts a Foundry relative path to a monster-file URL', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/bestiaries/creatures/dragon-red-young.webp')).toBe(
      'monster-file://img/systems/pf2e/icons/bestiaries/creatures/dragon-red-young.webp',
    );
  });

  it('handles a default NPC icon path', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/default-icons/npc.svg')).toBe(
      'monster-file://img/systems/pf2e/icons/default-icons/npc.svg',
    );
  });

  it('returns null for null input', () => {
    expect(toMonsterFileUrl(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toMonsterFileUrl(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(toMonsterFileUrl('')).toBeNull();
  });

  it('leaves an already-absolute https URL untouched (idempotent)', () => {
    const url = 'https://example.com/img/goblin.webp';
    expect(toMonsterFileUrl(url)).toBe(url);
  });

  it('leaves an already-absolute http URL untouched', () => {
    const url = 'http://localhost:30000/systems/pf2e/icons/npc.webp';
    expect(toMonsterFileUrl(url)).toBe(url);
  });

  it('leaves an already-rewritten monster-file URL untouched (idempotent)', () => {
    const url = 'monster-file://img/systems/pf2e/icons/npc.webp';
    expect(toMonsterFileUrl(url)).toBe(url);
  });

  it('encodes # so the fragment is not stripped by URL parsers', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/my#icon.webp')).toBe(
      'monster-file://img/systems/pf2e/icons/my%23icon.webp',
    );
  });

  it('encodes ? so query strings are not misinterpreted', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/img.webp?v=2')).toBe(
      'monster-file://img/systems/pf2e/icons/img.webp%3Fv=2',
    );
  });
});
