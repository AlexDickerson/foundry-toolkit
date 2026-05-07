import { describe, expect, it } from 'vitest';
import { isPlayerCharacter } from './actor-utils';

describe('isPlayerCharacter', () => {
  it('returns true for type "character"', () => {
    expect(isPlayerCharacter({ type: 'character' })).toBe(true);
  });

  it.each(['npc', 'familiar', 'loot', 'vehicle', 'party', 'hazard'])(
    'returns false for type "%s"',
    (type) => {
      expect(isPlayerCharacter({ type })).toBe(false);
    },
  );
});
