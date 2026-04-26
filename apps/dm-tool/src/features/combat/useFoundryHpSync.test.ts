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

// ─── isHpPath ────────────────────────────────────────────────────────────────

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

  it('does not match unrelated attribute paths', () => {
    expect(isHpPath('system.attributes.speed')).toBe(false);
    expect(isHpPath('system.attributes.ac')).toBe(false);
  });

  it('does not match paths that share a prefix but are not HP', () => {
    expect(isHpPath('system.attributes.hpBonus')).toBe(false);
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function mkSystem(hp: number, maxHp: number): Record<string, unknown> {
  return { attributes: { hp: { value: hp, max: maxHp, temp: 0 } } };
}

function mkActorUpdate(actorId: string, hp: number, maxHp: number): ActorUpdate {
  return {
    actorId,
    changedPaths: ['system.attributes.hp.value'],
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

function mkEncounter(id: string, combatants: Combatant[], name = 'Test'): Encounter {
  return {
    id,
    name,
    combatants,
    turnIndex: 0,
    round: 1,
    loot: [],
    allowInventedItems: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  onActorUpdatedMock.mockReset();
});

// ─── subscription lifecycle ──────────────────────────────────────────────────

describe('useFoundryHpSync — subscription lifecycle', () => {
  it('subscribes to onActorUpdated on mount', () => {
    onActorUpdatedMock.mockReturnValue(() => {});
    renderHook(() => useFoundryHpSync([], vi.fn()));
    expect(onActorUpdatedMock).toHaveBeenCalledOnce();
  });

  it('calls the unsubscribe function on unmount', () => {
    const unsubscribe = vi.fn();
    onActorUpdatedMock.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useFoundryHpSync([], vi.fn()));
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

// ─── HP propagation across encounters ────────────────────────────────────────

describe('useFoundryHpSync — HP propagation', () => {
  function setup() {
    let captured: ((u: ActorUpdate) => void) | null = null;
    onActorUpdatedMock.mockImplementation((cb: (u: ActorUpdate) => void) => {
      captured = cb;
      return () => {};
    });
    return { fire: (u: ActorUpdate) => captured?.(u) };
  }

  it('updates a matching combatant in a single encounter', async () => {
    const { fire } = setup();
    const combatant = mkCombatant({ foundryActorId: 'actor-1', hp: 40, maxHp: 50 });
    const enc = mkEncounter('e1', [combatant]);
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc], save));

    await act(async () => {
      fire(mkActorUpdate('actor-1', 25, 50));
    });

    expect(save).toHaveBeenCalledOnce();
    const updated = save.mock.calls[0][0] as Encounter;
    expect(updated.id).toBe('e1');
    expect(updated.combatants[0].hp).toBe(25);
  });

  it('updates the combatant in EVERY encounter that has the same actor', async () => {
    const { fire } = setup();
    const c1 = mkCombatant({ id: 'c-1', foundryActorId: 'actor-1', hp: 40, maxHp: 50 });
    const c2 = mkCombatant({ id: 'c-2', foundryActorId: 'actor-1', hp: 40, maxHp: 50 });
    const enc1 = mkEncounter('e1', [c1], 'Goblin Ambush');
    const enc2 = mkEncounter('e2', [c2], 'Dragon Fight');
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc1, enc2], save));

    await act(async () => {
      fire(mkActorUpdate('actor-1', 12, 50));
    });

    expect(save).toHaveBeenCalledTimes(2);
    const ids = save.mock.calls.map((call) => (call[0] as Encounter).id).sort();
    expect(ids).toEqual(['e1', 'e2']);
    for (const call of save.mock.calls) {
      const enc = call[0] as Encounter;
      expect(enc.combatants[0].hp).toBe(12);
    }
  });

  it('skips encounters whose combatant is already at the incoming HP (avoids round-trip loops)', async () => {
    const { fire } = setup();
    const combatant = mkCombatant({ foundryActorId: 'actor-1', hp: 25, maxHp: 50 });
    const enc = mkEncounter('e1', [combatant]);
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc], save));

    await act(async () => {
      fire(mkActorUpdate('actor-1', 25, 50));
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('ignores actor updates with no HP path', async () => {
    const { fire } = setup();
    const combatant = mkCombatant({ foundryActorId: 'actor-1' });
    const enc = mkEncounter('e1', [combatant]);
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc], save));

    await act(async () => {
      fire({
        actorId: 'actor-1',
        changedPaths: ['system.attributes.conditions.frightened'],
        system: mkSystem(40, 50),
      });
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('does not save when actorId has no matching combatant in any encounter', async () => {
    const { fire } = setup();
    const enc = mkEncounter('e1', [mkCombatant({ foundryActorId: 'other-actor' })]);
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc], save));

    await act(async () => {
      fire(mkActorUpdate('actor-1', 10, 50));
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('ignores combatants without a foundryActorId', async () => {
    const { fire } = setup();
    const enc = mkEncounter('e1', [mkCombatant({ hp: 30, maxHp: 40 })]); // no foundryActorId
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc], save));

    await act(async () => {
      fire(mkActorUpdate('actor-1', 10, 40));
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('preserves other combatant fields when updating HP', async () => {
    const { fire } = setup();
    const combatant = mkCombatant({
      foundryActorId: 'actor-1',
      displayName: 'Aria Stoneheart',
      initiative: 18,
      notes: 'Blessed',
    });
    const enc = mkEncounter('e1', [combatant]);
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useFoundryHpSync([enc], save));

    await act(async () => {
      fire(mkActorUpdate('actor-1', 5, 50));
    });

    const updatedCombatant = (save.mock.calls[0][0] as Encounter).combatants[0];
    expect(updatedCombatant.displayName).toBe('Aria Stoneheart');
    expect(updatedCombatant.initiative).toBe(18);
    expect(updatedCombatant.notes).toBe('Blessed');
    expect(updatedCombatant.hp).toBe(5);
  });
});
