// Unit tests for the monster image-URL rewrite helper.
// Imports from the Electron-free utility module so these tests run
// in the headless CI environment without a real Electron binary.

import { describe, expect, it } from 'vitest';
import { toMonsterFileUrl } from '../compendium/image-url';

const MCP = 'http://server.ad:8765';

describe('toMonsterFileUrl — mcp path (foundryMcpUrl provided)', () => {
  it('prefixes a modules/ path with the mcp base URL', () => {
    expect(
      toMonsterFileUrl('modules/pf2e-tokens-bestiaries/portraits/bestial/invertebrate/flash-beetle.webp', MCP),
    ).toBe('http://server.ad:8765/modules/pf2e-tokens-bestiaries/portraits/bestial/invertebrate/flash-beetle.webp');
  });

  it('prefixes a systems/ path with the mcp base URL', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/default-icons/npc.svg', MCP)).toBe(
      'http://server.ad:8765/systems/pf2e/icons/default-icons/npc.svg',
    );
  });

  it('strips trailing slash from the base URL before joining', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/npc.svg', 'http://server.ad:8765/')).toBe(
      'http://server.ad:8765/systems/pf2e/icons/npc.svg',
    );
  });

  it('leaves an already-absolute http URL untouched', () => {
    const url = 'http://localhost:30000/systems/pf2e/icons/npc.webp';
    expect(toMonsterFileUrl(url, MCP)).toBe(url);
  });

  it('leaves an already-absolute https URL untouched', () => {
    const url = 'https://example.com/img/goblin.webp';
    expect(toMonsterFileUrl(url, MCP)).toBe(url);
  });
});

describe('toMonsterFileUrl — local fallback (no foundryMcpUrl)', () => {
  it('converts a Foundry relative path to a monster-file URL', () => {
    expect(toMonsterFileUrl('systems/pf2e/icons/bestiaries/creatures/dragon-red-young.webp')).toBe(
      'monster-file://img/systems/pf2e/icons/bestiaries/creatures/dragon-red-young.webp',
    );
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

  it('leaves an already-rewritten monster-file URL untouched (idempotent)', () => {
    const url = 'monster-file://img/systems/pf2e/icons/npc.webp';
    expect(toMonsterFileUrl(url)).toBe(url);
  });
});

describe('toMonsterFileUrl — null / empty inputs', () => {
  it('returns null for null', () => {
    expect(toMonsterFileUrl(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toMonsterFileUrl(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(toMonsterFileUrl('')).toBeNull();
  });
});
