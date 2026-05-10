import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, within, act } from '@testing-library/react';
import amiri from '@/fixtures/amiri-prepared.json';
import type { CharacterSystem } from '@/features/characters/types';
import { Character } from './Character';
import { api } from '@/features/characters/api';

vi.mock('@/features/characters/api', () => ({
  api: {
    dispatch: vi.fn().mockResolvedValue({ result: null }),
    rollActorStatistic: vi.fn().mockResolvedValue({}),
    adjustActorResource: vi.fn().mockResolvedValue({}),
    adjustActorCondition: vi.fn().mockResolvedValue({}),
    longRest: vi.fn().mockResolvedValue({}),
  },
}));

// Amiri — level-1 human barbarian. Verified values pulled from the live
// /prepared payload: str+4 (key), dex+2, con+2, int+0, wis+0, cha+1,
// AC 18, HP 22/22, Perception +5, Fort +7, Ref +5, Will +5, Class DC 17.
const system = (amiri as unknown as { system: CharacterSystem }).system;

describe('Character tab', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the six ability modifiers with correct signs', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    const expected: Record<string, string> = {
      str: '+4', dex: '+2', con: '+2', int: '+0', wis: '+0', cha: '+1',
    };
    for (const [slug, mod] of Object.entries(expected)) {
      const row = container.querySelector(`[data-attribute="${slug}"]`);
      expect(row, `ability row for ${slug}`).toBeTruthy();
      expect(within(row as HTMLElement).getByText(mod)).toBeTruthy();
    }
  });

  it("marks the character's key ability", () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    const strRow = container.querySelector('[data-attribute="str"]');
    expect(strRow?.textContent).toContain('KEY');
    const dexRow = container.querySelector('[data-attribute="dex"]');
    expect(dexRow?.textContent).not.toContain('KEY');
  });

  it('renders the headline stats (AC, HP, Perception)', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    expect(container.querySelector('[data-stat="hp"]')?.textContent).toContain('22');
    expect(container.querySelector('[data-stat="perception"]')?.textContent).toContain('+5');
    const acLabel = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'AC');
    expect(acLabel, 'AC label').toBeTruthy();
  });

  it('renders the three saves with correct modifiers', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    expect(container.querySelector('[data-stat="save-fortitude"]')?.textContent).toContain('+7');
    expect(container.querySelector('[data-stat="save-reflex"]')?.textContent).toContain('+5');
    expect(container.querySelector('[data-stat="save-will"]')?.textContent).toContain('+5');
  });

  it('renders the class DC (Barbarian @ 17)', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    const dc = container.querySelector('[data-stat="class-dc"]');
    expect(dc, 'class DC tile').toBeTruthy();
    expect(dc?.textContent).toContain('17');
  });

  it("renders Amiri's land speed", () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    expect(container.textContent).toContain('25 ft');
  });

  it('renders the conditions row (Dying/Wounded/Doomed)', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    const row = container.querySelector('[data-section="conditions"]');
    expect(row, 'conditions row').toBeTruthy();
    for (const stat of ['dying', 'wounded', 'doomed']) {
      const cond = container.querySelector(`[data-stat="${stat}"]`);
      expect(cond, `${stat} tile`).toBeTruthy();
      expect(cond?.textContent).toContain('0/');
    }
  });

  it('does not render an investiture counter (moved to Inventory tab)', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    expect(container.querySelector('[data-stat="investiture"]')).toBeNull();
  });

  it('omits Focus and Mythic resources when max is zero', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    expect(container.querySelector('[data-stat="focus"]')).toBeNull();
    expect(container.querySelector('[data-stat="mythic-points"]')).toBeNull();
  });

  it('hides the Defenses block when IWR are all empty (Amiri)', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
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
    const { container } = render(<Character system={custom} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    expect(container.querySelector('[data-section="iwr"]')).toBeTruthy();
    expect(container.querySelector('[data-iwr="immunities"]')?.textContent).toContain('Fire');
    expect(container.querySelector('[data-iwr="weaknesses"]')?.textContent).toContain('Cold 5');
    expect(container.querySelector('[data-iwr="resistances"]')?.textContent).toContain('Physical 2');
  });

  it('hides Shield tile when no shield is equipped (Amiri)', () => {
    const { container } = render(<Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
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
    const { container } = render(<Character system={shielded} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />);
    const tile = container.querySelector('[data-stat="shield"]');
    expect(tile, 'shield tile').toBeTruthy();
    expect(tile?.textContent).toContain('Steel Shield');
    expect(tile?.textContent).toContain('+2');
    expect(tile?.textContent).toContain('15/20');
    expect(tile?.textContent).toContain('Raised');
  });
});

// ─── Dispatcher end-to-end: all three save buttons ──────────────────────────

describe('Character tab — saves wired through dispatcher', () => {
  beforeEach(() => {
    vi.mocked(api.dispatch).mockClear();
    vi.mocked(api.dispatch).mockResolvedValue({ result: null });
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ['save-fortitude', 'saves.fortitude.roll'],
    ['save-reflex', 'saves.reflex.roll'],
    ['save-will', 'saves.will.roll'],
  ])('clicking the %s tile dispatches method=%s', async (dataStat, expectedMethod) => {
    const { container } = render(
      <Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />,
    );

    const tile = container.querySelector(`[data-stat="${dataStat}"]`) as HTMLButtonElement;
    expect(tile, `${dataStat} tile should render as a button`).toBeTruthy();

    await act(async () => {
      fireEvent.click(tile);
    });

    expect(api.dispatch).toHaveBeenCalledWith({
      class: 'CharacterPF2e',
      id: 'test-actor',
      method: expectedMethod,
      args: [{}],
    });
  });

  it('none of the save tiles call rollActorStatistic', async () => {
    const { container } = render(
      <Character system={system} actorId="test-actor" onActorChanged={() => undefined} items={[]} characterLevel={1} />,
    );

    for (const stat of ['save-fortitude', 'save-reflex', 'save-will']) {
      const tile = container.querySelector(`[data-stat="${stat}"]`) as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(tile);
      });
    }

    expect(api.rollActorStatistic).not.toHaveBeenCalled();
  });
});
