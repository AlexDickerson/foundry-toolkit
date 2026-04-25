import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prefetchIcons } from './prefetchIcons';
import type { PreparedCharacter, Strike } from '../api/types';

// Minimal fixture shape — only the fields prefetchIcons touches.
type IconFixture = Pick<PreparedCharacter, 'items' | 'system'>;

function makeActor(overrides: Partial<IconFixture> = {}): PreparedCharacter {
  const base: IconFixture = {
    items: [],
    system: {
      actions: [],
      attributes: {
        shield: {
          itemId: null,
          name: 'PF2E.ArmorTypeShield',
          ac: 0,
          hp: { value: 0, max: 0 },
          brokenThreshold: 0,
          hardness: 0,
          raised: false,
          broken: false,
          destroyed: false,
          icon: '',
        },
        // Remaining attribute fields are not touched by prefetchIcons;
        // cast to satisfy the full type.
        ac: { value: 0, totalModifier: 0, dc: 0, breakdown: '', attribute: '' },
        hp: { value: 0, max: 0, temp: 0, totalModifier: 0, breakdown: '' },
        classDC: null,
        dying: { value: 0, max: 0, recoveryDC: 0 },
        wounded: { value: 0, max: 0 },
        doomed: { value: 0, max: 0 },
        immunities: [],
        weaknesses: [],
        resistances: [],
        reach: { base: 0, manipulate: 0 },
        handsFree: 2,
      },
      // Remaining system fields cast through unknown — tests only read
      // actions and attributes.shield.
      abilities: {} as PreparedCharacter['system']['abilities'],
      crafting: { formulas: [], entries: {} },
      details: {} as PreparedCharacter['system']['details'],
      initiative: {} as PreparedCharacter['system']['initiative'],
      perception: {} as PreparedCharacter['system']['perception'],
      resources: {} as PreparedCharacter['system']['resources'],
      movement: {} as PreparedCharacter['system']['movement'],
      traits: {} as PreparedCharacter['system']['traits'],
      saves: {} as PreparedCharacter['system']['saves'],
      skills: {},
      proficiencies: {} as PreparedCharacter['system']['proficiencies'],
    },
  };

  return {
    id: 'test-actor',
    uuid: 'Actor.test-actor',
    name: 'Test Character',
    type: 'character',
    img: 'icons/actor.webp',
    ...base,
    ...overrides,
  } as PreparedCharacter;
}

function makeStrike(img: string): Strike {
  return {
    slug: 'strike',
    label: 'Strike',
    totalModifier: 0,
    quantity: 1,
    ready: true,
    visible: true,
    glyph: 'A',
    type: 'strike',
    item: {
      _id: 'item-1',
      img,
      name: 'Longsword',
      type: 'weapon',
      system: {},
    },
    traits: [],
    weaponTraits: [],
    variants: [],
    canAttack: true,
  };
}

// Track Image instances created during each test.
let capturedImages: { src: string }[] = [];
let OriginalImage: typeof Image;

class MockImage {
  src = '';
}

beforeEach(() => {
  capturedImages = [];
  OriginalImage = globalThis.Image;

  // Proxy the MockImage so we can track every instance.
  const Tracked = new Proxy(MockImage, {
    construct(Target) {
      const instance = new Target();
      capturedImages.push(instance);
      return instance;
    },
  });

  globalThis.Image = Tracked as unknown as typeof Image;
});

afterEach(() => {
  globalThis.Image = OriginalImage;
  vi.restoreAllMocks();
});

describe('prefetchIcons', () => {
  it('collects img from all items in the actor', () => {
    const actor = makeActor({
      items: [
        { id: 'a', name: 'Longsword', type: 'weapon', img: 'icons/weapons/longsword.webp', system: {} },
        { id: 'b', name: 'Studded Leather', type: 'armor', img: 'systems/pf2e/icons/armor/studded-leather.webp', system: {} },
        { id: 'c', name: 'Power Attack', type: 'feat', img: 'systems/pf2e/icons/feats/power-attack.webp', system: {} },
      ],
    });

    prefetchIcons(actor);

    const srcs = capturedImages.map((i) => i.src);
    expect(srcs).toContain('icons/weapons/longsword.webp');
    expect(srcs).toContain('systems/pf2e/icons/armor/studded-leather.webp');
    expect(srcs).toContain('systems/pf2e/icons/feats/power-attack.webp');
  });

  it('collects icon from the shield slot', () => {
    const actor = makeActor();
    actor.system.attributes.shield.icon = 'systems/pf2e/icons/shields/wooden-shield.webp';

    prefetchIcons(actor);

    const srcs = capturedImages.map((i) => i.src);
    expect(srcs).toContain('systems/pf2e/icons/shields/wooden-shield.webp');
  });

  it('deduplicates paths so only one Image is created per unique path', () => {
    const sharedImg = 'icons/weapons/shortsword.webp';
    const actor = makeActor({
      items: [
        { id: 'a', name: 'Shortsword', type: 'weapon', img: sharedImg, system: {} },
        { id: 'b', name: 'Shortsword (offhand)', type: 'weapon', img: sharedImg, system: {} },
      ],
    });

    prefetchIcons(actor);

    const matching = capturedImages.filter((i) => i.src === sharedImg);
    expect(matching).toHaveLength(1);
  });

  it('skips empty string img values', () => {
    const actor = makeActor({
      items: [
        { id: 'a', name: 'Mystery Item', type: 'equipment', img: '', system: {} },
      ],
    });

    prefetchIcons(actor);

    // The empty-string src item must not produce an Image.
    const matching = capturedImages.filter((i) => i.src === '');
    expect(matching).toHaveLength(0);
  });

  it('skips falsy shield icon', () => {
    const actor = makeActor();
    actor.system.attributes.shield.icon = '';

    prefetchIcons(actor);

    // No Image should be created for the empty shield icon.
    const matching = capturedImages.filter((i) => i.src === '');
    expect(matching).toHaveLength(0);
  });

  it('collects img from system.actions strike item sources', () => {
    const actor = makeActor({
      system: {
        ...makeActor().system,
        actions: [
          makeStrike('icons/weapons/polearms/spear-hooked-broad.webp'),
          makeStrike('systems/pf2e/icons/unarmed-strike.webp'),
        ],
      },
    });

    prefetchIcons(actor);

    const srcs = capturedImages.map((i) => i.src);
    expect(srcs).toContain('icons/weapons/polearms/spear-hooked-broad.webp');
    expect(srcs).toContain('systems/pf2e/icons/unarmed-strike.webp');
  });

  it('deduplicates when item img and strike item img are the same path', () => {
    const sharedImg = 'icons/weapons/longsword.webp';
    const actor = makeActor({
      items: [{ id: 'w', name: 'Longsword', type: 'weapon', img: sharedImg, system: {} }],
      system: {
        ...makeActor().system,
        actions: [makeStrike(sharedImg)],
      },
    });

    prefetchIcons(actor);

    const matching = capturedImages.filter((i) => i.src === sharedImg);
    expect(matching).toHaveLength(1);
  });

  it('creates no Image objects when actor has no icons', () => {
    const actor = makeActor();

    prefetchIcons(actor);

    expect(capturedImages).toHaveLength(0);
  });
});
