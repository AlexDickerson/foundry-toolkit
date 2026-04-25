// Tests for item icon URL resolution via the asset-proxy helper.
// The same toMonsterFileUrl function used for monster portraits also handles
// item icons — confirmed by the identical path prefixes (icons/, systems/).

import { describe, expect, it } from 'vitest';
import { toMonsterFileUrl } from '../compendium/image-url';

const MCP = 'http://server.ad:8765';

describe('item icon → asset proxy URL (foundryMcpUrl provided)', () => {
  it('prefixes an icons/ path with the mcp base URL', () => {
    expect(toMonsterFileUrl('icons/equipment/weapons/sword-longsword.webp', MCP)).toBe(
      'http://server.ad:8765/icons/equipment/weapons/sword-longsword.webp',
    );
  });

  it('prefixes a systems/pf2e/icons/ equipment path with the mcp base URL', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp', MCP)).toBe(
      'http://server.ad:8765/systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp',
    );
  });

  it('strips trailing slash from the base URL before joining', () => {
    expect(toMonsterFileUrl('icons/equipment/armor/plate.webp', 'http://server.ad:8765/')).toBe(
      'http://server.ad:8765/icons/equipment/armor/plate.webp',
    );
  });

  it('leaves an already-absolute http URL untouched', () => {
    const url = 'http://localhost:30000/icons/equipment/weapons/sword.webp';
    expect(toMonsterFileUrl(url, MCP)).toBe(url);
  });
});

describe('item icon → local fallback (no foundryMcpUrl)', () => {
  it('converts a Foundry-relative icons/ path to a monster-file URL', () => {
    expect(toMonsterFileUrl('icons/equipment/weapons/sword-longsword.webp')).toBe(
      'monster-file://img/icons/equipment/weapons/sword-longsword.webp',
    );
  });

  it('converts a systems/pf2e path to a monster-file URL', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp')).toBe(
      'monster-file://img/systems/pf2e/icons/equipment/consumables/potions/potion-minor.webp',
    );
  });
});

describe('item icon — null / empty inputs', () => {
  it('returns null for null (missing img field)', () => {
    expect(toMonsterFileUrl(null)).toBeNull();
  });

  it('returns null for empty string (default placeholder that projection filtered to null)', () => {
    expect(toMonsterFileUrl('')).toBeNull();
  });
});
