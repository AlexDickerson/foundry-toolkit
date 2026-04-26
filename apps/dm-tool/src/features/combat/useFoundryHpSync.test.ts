/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorUpdate, Combatant, Encounter } from '@foundry-toolkit/shared/types';

const { onActorUpdatedMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onActorUpdatedMock: vi.fn() as any,
}));

vi.mock('@/lib/api', () => ({
  api: {
    onActorUpdated: onActorUpdatedMock,
  },
}));

import { isHpPath, useFoundryHpSync } from './useFoundryHpSync';

// ---------------------------------------------------------------------------
// isHpPath — moved here from actor-watcher since it is a renderer concern
// ---------------------------------------------------------------------------

describe('isHpPath', () => {
  it('matches the bare HP path', () => {
    expect(isHpPath('system.attributes.hp')).toBe(true);
  });

  it('matches hp.value', () => {
    expect(isHpPath('system.attributes.hp.value')).toBe(true);
  });

  it('matches hp.max', () => {
    expect(isHpPath('system.attributes.hp.max')).toBe(true);
  });

  it('matches hp.temp', () => {
    expect(isHpPath('system.attributes.hp.temp')).toBe(true);
  });

  it('matches deeply nested HP paths', () => {
    expect(isHpPath('system.attributes.hp.details.negativeHealing')).toBe(true);
  });

  it('does not match unrelated attribute paths', () => {
    expect(isHpPath('system.attributes.speed')).toBe(false);
    expect(isHpPath('system.attributes.ac')).toBe(false);
  });

  it('does not match paths that share a prefix but are not HP', () => {
    expect(isHpPath('system.attributes.hpBonus')).toBe(false);
    expect(isHpPath('system.attributes.hp-regen')).toBe(false);
  });

  it('does not match short or unrelated paths', () => {
    expect(isHpPath('name')).toBe(false);
    expect(isHpPath('system')).toBe(false);
    expect(isHpPath('system.attributes')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useFoundryHpSync helpers
// ---------------------------------------------------------------------------

function mkSystem(hp: number, maxHp: number): Record<string, unknown> {
  return { attributes: { hp: { value: hp, max: maxHp, temp: 0 } } };
}

function mkActorUpdate(actorId: string, hp: number, maxHp: number, extraPaths: string[] = []): ActorUpdate {
  return {
    actorId,
    changedPaths: ['system.attributes.hp.value', ...extraPaths],
    system: mkSystem(hp, maxHp),
  };
}

function mkCombatant(overrides?: Partial<Combatant>): Combatant {
  return {
    id: 'c-1',
    kind: 'pc',
    displayName: 'Aria',
    initiativeMod: 5,
    initiative: 10,
    hp: 40,
    maxHp: 50,
    ...overrides,
  };
}

function mkEncounter(overrides?: Partial<Encounter>): Encounter {
  return {
    id: 'enc-1',
    name: 'Test Encounter',
    combatants: [],
    turnIndex: 0,
    round: 1,
    loot: [],
    allowInventedItems: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  onActorUpdatedMock.mockReset();
});

// ---------------------------------------------------------------------------
// Subscription lifecycle
// ---------------------------------------------------------------------------

describe('useFoundryHpSync — subscription lifecycle', () => {
  it('subscribes to onActorUpdated on mount', () => {
    onActorUpdatedMock.mockReturnValue(() => {});
    renderHook(() => useFoundryHpSync(mkEncounter(), vi.fn()));
    expect(onActorUpdatedMock).toHaveBeenCalledOnce();
  });

  it('calls the unsubscribe function on unmount', () => {
    const unsubscribe = vi.fn();
    onActorUpdatedMock.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useFoundryHpSync(mkEncounter(), vi.fn()));
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// HP update propagation
// ---------------------------------------------------------------------------

describe('useFoundryHpSync — HP update propagation', () => {
  it('calls onChange with updated HP when a matching actor update arrives', async () => {
    let capturedCallback: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ foundryActorId: 'foundry-actor-abc', hp: 40, maxHp: 50 });
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!(mkActorUpdate('foundry-actor-abc', 25, 50));
    });

    expect(onChange).toHaveBeenCalledOnce();
    const updatedEnc = onChange.mock.calls[0][0] as Encounter;
    expect(updatedEnc.combatants[0].hp).toBe(25);
    expect(updatedEnc.combatants[0].maxHp).toBe(50);
  });

  it('also updates maxHp when it changes', async () => {
    let capturedCallback: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ foundryActorId: 'actor-1', hp: 50, maxHp: 50 });
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!(mkActorUpdate('actor-1', 50, 60));
    });

    const updatedEnc = onChange.mock.calls[0][0] as Encounter;
    expect(updatedEnc.combatants[0].hp).toBe(50);
    expect(updatedEnc.combatants[0].maxHp).toBe(60);
  });

  it('ignores actor updates where no path is HP-related', async () => {
    let capturedCallback: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ foundryActorId: 'actor-1' });
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      // Condition change — not HP-related
      capturedCallback!({
        actorId: 'actor-1',
        changedPaths: ['system.attributes.conditions.frightened'],
        system: mkSystem(40, 50),
      });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when actorId has no matching combatant', async () => {
    let capturedCallback: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [] }), onChange));

    await act(async () => {
      capturedCallback!(mkActorUpdate('unknown-actor', 10, 50));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores updates for combatants without a foundryActorId', async () => {
    let capturedCallback: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ hp: 30, maxHp: 40 }); // no foundryActorId
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!(mkActorUpdate('some-actor', 10, 40));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves other combatant fields when updating HP', async () => {
    let capturedCallback: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({
      foundryActorId: 'actor-1',
      displayName: 'Aria Stoneheart',
      initiative: 18,
      notes: 'Blessed',
    });
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!(mkActorUpdate('actor-1', 5, 50));
    });

    const updatedCombatant = (onChange.mock.calls[0][0] as Encounter).combatants[0];
    expect(updatedCombatant.displayName).toBe('Aria Stoneheart');
    expect(updatedCombatant.initiative).toBe(18);
    expect(updatedCombatant.notes).toBe('Blessed');
    expect(updatedCombatant.hp).toBe(5);
  });
});
