import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import amiri from '../../fixtures/amiri-prepared.json';
import type { CharacterSystem } from '../../api/types';
import { Character } from './Character';

// Amiri — level-1 human barbarian. Verified values pulled from the live
// /prepared payload: str+4 (key), dex+2, con+2, int+0, wis+0, cha+1,
// AC 18, HP 22/22, Perception +5, Fort +7, Ref +5, Will +5, Class DC 17.
const system = (amiri as unknown as { system: CharacterSystem }).system;

describe('Character tab', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the six ability modifiers with correct signs', () => {
    const { container } = render(<Character system={system} />);
    const expected: Record<string, string> = {
      str: '+4',
      dex: '+2',
      con: '+2',
      int: '+0',
      wis: '+0',
      cha: '+1',
    };
    for (const [slug, mod] of Object.entries(expected)) {
      const row = container.querySelector(`[data-attribute="${slug}"]`);
      expect(row, `ability row for ${slug}`).toBeTruthy();
      expect(within(row as HTMLElement).getByText(mod)).toBeTruthy();
    }
  });

  it("marks the character's key ability", () => {
    const { container } = render(<Character system={system} />);
    const strRow = container.querySelector('[data-attribute="str"]');
    expect(strRow?.textContent).toContain('KEY');
    // Non-key abilities should not carry the KEY badge.
    const dexRow = container.querySelector('[data-attribute="dex"]');
    expect(dexRow?.textContent).not.toContain('KEY');
  });

  it('renders the headline stats (AC, HP, Perception)', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-stat="hp"]')?.textContent).toContain('22');
    expect(container.querySelector('[data-stat="perception"]')?.textContent).toContain('+5');
    // AC 18 is in the StatTile without data-stat but in the first StatsBlock row.
    const acLabel = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'AC');
    expect(acLabel, 'AC label').toBeTruthy();
  });

  it('renders the three saves with correct modifiers', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-stat="save-fortitude"]')?.textContent).toContain('+7');
    expect(container.querySelector('[data-stat="save-reflex"]')?.textContent).toContain('+5');
    expect(container.querySelector('[data-stat="save-will"]')?.textContent).toContain('+5');
  });

  it('renders the class DC (Barbarian @ 17)', () => {
    const { container } = render(<Character system={system} />);
    const dc = container.querySelector('[data-stat="class-dc"]');
    expect(dc, 'class DC tile').toBeTruthy();
    expect(dc?.textContent).toContain('17');
  });

  it('renders hero points pips (1 of 3)', () => {
    const { container } = render(<Character system={system} />);
    const hp = container.querySelector('[data-stat="hero-points"]');
    expect(hp, 'hero points tile').toBeTruthy();
    expect(hp?.textContent).toContain('1/3');
  });

  it('renders languages (Hallit, Common)', () => {
    const { container } = render(<Character system={system} />);
    const langs = container.querySelector('[data-section="languages"]');
    expect(langs, 'languages section').toBeTruthy();
    expect(langs?.textContent).toContain('Hallit');
    expect(langs?.textContent).toContain('Common');
  });

  it('renders traits (Human, Humanoid)', () => {
    const { container } = render(<Character system={system} />);
    const traits = container.querySelector('[data-section="traits"]');
    expect(traits?.textContent).toContain('Human');
    expect(traits?.textContent).toContain('Humanoid');
  });

  it("renders Amiri's land speed (25 ft)", () => {
    const { container } = render(<Character system={system} />);
    expect(container.textContent).toContain('25 ft');
  });

  it('renders the initiative tile (+5 for Amiri)', () => {
    const { container } = render(<Character system={system} />);
    const tile = container.querySelector('[data-stat="initiative"]');
    expect(tile, 'initiative tile').toBeTruthy();
    expect(tile?.textContent).toContain('+5');
  });

  it('renders the conditions row (Dying/Wounded/Doomed)', () => {
    const { container } = render(<Character system={system} />);
    const row = container.querySelector('[data-section="conditions"]');
    expect(row, 'conditions row').toBeTruthy();
    for (const stat of ['dying', 'wounded', 'doomed']) {
      const cond = container.querySelector(`[data-stat="${stat}"]`);
      expect(cond, `${stat} tile`).toBeTruthy();
      // Amiri is 0 for each.
      expect(cond?.textContent).toContain('0/');
    }
  });

  it('shows investiture resource for Amiri (0/10)', () => {
    const { container } = render(<Character system={system} />);
    const inv = container.querySelector('[data-stat="investiture"]');
    expect(inv, 'investiture').toBeTruthy();
    expect(inv?.textContent).toContain('0');
    expect(inv?.textContent).toContain('/10');
  });

  it('omits Focus and Mythic resources when max is zero', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-stat="focus"]')).toBeNull();
    expect(container.querySelector('[data-stat="mythic-points"]')).toBeNull();
  });

  it('renders all populated speeds (Land + Travel for Amiri)', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-speed="land"]')).toBeTruthy();
    expect(container.querySelector('[data-speed="travel"]')).toBeTruthy();
    // Unpopulated speeds should not render.
    expect(container.querySelector('[data-speed="fly"]')).toBeNull();
    expect(container.querySelector('[data-speed="climb"]')).toBeNull();
  });

  it('hides the Defenses block when IWR are all empty (Amiri)', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-section="iwr"]')).toBeNull();
  });

  it('renders IWR rows when entries exist', () => {
    const custom = {
      ...system,
      attributes: {
        ...system.attributes,
        immunities: [{ type: 'fire' }],
        weaknesses: [{ type: 'cold', value: 5 }],
        resistances: [{ type: 'physical', value: 2, exceptions: ['adamantine'] }],
      },
    } as CharacterSystem;
    const { container } = render(<Character system={custom} />);
    expect(container.querySelector('[data-section="iwr"]')).toBeTruthy();
    expect(container.querySelector('[data-iwr="immunities"]')?.textContent).toContain('Fire');
    expect(container.querySelector('[data-iwr="weaknesses"]')?.textContent).toContain('Cold 5');
    expect(container.querySelector('[data-iwr="resistances"]')?.textContent).toContain('Physical 2');
  });

  it('shows handsFree value (2 for Amiri)', () => {
    const { container } = render(<Character system={system} />);
    const hf = container.querySelector('[data-stat="hands-free"]');
    expect(hf, 'hands-free tile').toBeTruthy();
    expect(hf?.textContent).toBe('2');
  });

  it('hides Reach when base is 5 and manipulate matches (Amiri default)', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-stat="reach"]')).toBeNull();
  });

  it('shows Reach when non-default', () => {
    const reachy: CharacterSystem = {
      ...system,
      attributes: { ...system.attributes, reach: { base: 10, manipulate: 10 } },
    };
    const { container } = render(<Character system={reachy} />);
    const reach = container.querySelector('[data-stat="reach"]');
    expect(reach, 'reach tile').toBeTruthy();
    expect(reach?.textContent).toContain('10 ft');
  });

  it('hides Deity when deity.value is empty (Amiri)', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-stat="deity"]')).toBeNull();
  });

  it('shows Deity when populated', () => {
    const faithful: CharacterSystem = {
      ...system,
      details: { ...system.details, deity: { image: 'x.svg', value: 'Iomedae' } },
    };
    const { container } = render(<Character system={faithful} />);
    const deity = container.querySelector('[data-stat="deity"]');
    expect(deity?.textContent).toBe('Iomedae');
  });

  it('hides Shield tile when no shield is equipped (Amiri)', () => {
    const { container } = render(<Character system={system} />);
    expect(container.querySelector('[data-stat="shield"]')).toBeNull();
  });

  it('shows Shield tile with raised state when equipped', () => {
    const shielded: CharacterSystem = {
      ...system,
      attributes: {
        ...system.attributes,
        shield: {
          itemId: 'abc123',
          name: 'Steel Shield',
          ac: 2,
          hp: { value: 15, max: 20 },
          brokenThreshold: 10,
          hardness: 5,
          raised: true,
          broken: false,
          destroyed: false,
          icon: 'icons/shield.webp',
        },
      },
    };
    const { container } = render(<Character system={shielded} />);
    const tile = container.querySelector('[data-stat="shield"]');
    expect(tile, 'shield tile').toBeTruthy();
    expect(tile?.textContent).toContain('Steel Shield');
    expect(tile?.textContent).toContain('+2');
    expect(tile?.textContent).toContain('15/20');
    expect(tile?.textContent).toContain('Raised');
  });
});
