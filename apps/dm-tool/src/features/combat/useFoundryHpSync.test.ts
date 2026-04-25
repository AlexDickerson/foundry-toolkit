/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorHpUpdate, Combatant, Encounter } from '@foundry-toolkit/shared/types';

// vi.hoisted lifts the mock above vi.mock (which itself is hoisted above imports).
const { onActorHpUpdatedMock } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onActorHpUpdatedMock: vi.fn() as any,
}));

vi.mock('@/lib/api', () => ({
  api: {
    onActorHpUpdated: onActorHpUpdatedMock,
  },
}));

import { useFoundryHpSync } from './useFoundryHpSync';

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
  onActorHpUpdatedMock.mockReset();
});

describe('useFoundryHpSync — subscription lifecycle', () => {
  it('subscribes to onActorHpUpdated on mount', () => {
    onActorHpUpdatedMock.mockReturnValue(() => {});
    renderHook(() => useFoundryHpSync(mkEncounter(), vi.fn()));
    expect(onActorHpUpdatedMock).toHaveBeenCalledOnce();
  });

  it('calls the unsubscribe function returned by onActorHpUpdated on unmount', () => {
    const unsubscribe = vi.fn();
    onActorHpUpdatedMock.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useFoundryHpSync(mkEncounter(), vi.fn()));
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('useFoundryHpSync — HP update propagation', () => {
  it('calls onChange with updated HP when a matching actor update arrives', async () => {
    let capturedCallback: ((u: ActorHpUpdate) => void) | null = null;
    onActorHpUpdatedMock.mockImplementation((cb: (u: ActorHpUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ foundryActorId: 'foundry-actor-abc', hp: 40, maxHp: 50 });
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!({ actorId: 'foundry-actor-abc', hp: 25, maxHp: 50 });
    });

    expect(onChange).toHaveBeenCalledOnce();
    const updatedEnc = onChange.mock.calls[0][0] as Encounter;
    expect(updatedEnc.combatants[0].hp).toBe(25);
    expect(updatedEnc.combatants[0].maxHp).toBe(50);
  });

  it('also updates maxHp when it changes', async () => {
    let capturedCallback: ((u: ActorHpUpdate) => void) | null = null;
    onActorHpUpdatedMock.mockImplementation((cb: (u: ActorHpUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ foundryActorId: 'actor-1', hp: 50, maxHp: 50 });
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!({ actorId: 'actor-1', hp: 50, maxHp: 60 });
    });

    const updatedEnc = onChange.mock.calls[0][0] as Encounter;
    expect(updatedEnc.combatants[0].hp).toBe(50);
    expect(updatedEnc.combatants[0].maxHp).toBe(60);
  });

  it('does not call onChange when actorId has no matching combatant', async () => {
    let capturedCallback: ((u: ActorHpUpdate) => void) | null = null;
    onActorHpUpdatedMock.mockImplementation((cb: (u: ActorHpUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [] }), onChange));

    await act(async () => {
      capturedCallback!({ actorId: 'unknown-actor', hp: 10, maxHp: 50 });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores updates for combatants without a foundryActorId', async () => {
    let capturedCallback: ((u: ActorHpUpdate) => void) | null = null;
    onActorHpUpdatedMock.mockImplementation((cb: (u: ActorHpUpdate) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    const combatant = mkCombatant({ hp: 30, maxHp: 40 }); // no foundryActorId
    const onChange = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync(mkEncounter({ combatants: [combatant] }), onChange));

    await act(async () => {
      capturedCallback!({ actorId: 'some-actor', hp: 10, maxHp: 40 });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves other combatant fields when updating HP', async () => {
    let capturedCallback: ((u: ActorHpUpdate) => void) | null = null;
    onActorHpUpdatedMock.mockImplementation((cb: (u: ActorHpUpdate) => void) => {
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
      capturedCallback!({ actorId: 'actor-1', hp: 5, maxHp: 50 });
    });

    const updatedCombatant = (onChange.mock.calls[0][0] as Encounter).combatants[0];
    expect(updatedCombatant.displayName).toBe('Aria Stoneheart');
    expect(updatedCombatant.initiative).toBe(18);
    expect(updatedCombatant.notes).toBe('Blessed');
    expect(updatedCombatant.hp).toBe(5);
  });
});
