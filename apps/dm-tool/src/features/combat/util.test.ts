import { describe, it, expect } from 'vitest';
import { applyFoundryInitiativeUpdate, sortedCombatants } from './util';
import type { Combatant, Encounter } from '@foundry-toolkit/shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCombatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  return {
    kind: 'pc',
    displayName: 'Test PC',
    initiativeMod: 0,
    initiative: null,
    hp: 20,
    maxHp: 20,
    ...overrides,
  };
}

function makeEncounter(overrides: Partial<Encounter> & { id: string }): Encounter {
  return {
    name: 'Test Encounter',
    combatants: [],
    turnIndex: 0,
    round: 1,
    loot: [],
    allowInventedItems: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── sortedCombatants ─────────────────────────────────────────────────────────

describe('sortedCombatants', () => {
  it('sorts by initiative descending', () => {
    const combatants = [
      makeCombatant({ id: 'a', initiative: 10 }),
      makeCombatant({ id: 'b', initiative: 20 }),
      makeCombatant({ id: 'c', initiative: 5 }),
    ];
    const sorted = sortedCombatants(combatants);
    expect(sorted.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('places unrolled combatants (null initiative) at the end', () => {
    const combatants = [makeCombatant({ id: 'a', initiative: null }), makeCombatant({ id: 'b', initiative: 15 })];
    const sorted = sortedCombatants(combatants);
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('a');
  });

  it('breaks ties by initiativeMod descending', () => {
    const combatants = [
      makeCombatant({ id: 'a', initiative: 15, initiativeMod: 2 }),
      makeCombatant({ id: 'b', initiative: 15, initiativeMod: 5 }),
    ];
    const sorted = sortedCombatants(combatants);
    expect(sorted[0].id).toBe('b');
  });

  it('does not mutate the original array', () => {
    const combatants = [makeCombatant({ id: 'a', initiative: 5 }), makeCombatant({ id: 'b', initiative: 20 })];
    const original = [...combatants];
    sortedCombatants(combatants);
    expect(combatants[0].id).toBe(original[0].id);
  });
});

// ─── applyFoundryInitiativeUpdate ────────────────────────────────────────────

describe('applyFoundryInitiativeUpdate', () => {
  it('updates initiative for a combatant matching foundryActorId', () => {
    const enc = makeEncounter({
      id: 'enc-1',
      combatants: [
        makeCombatant({ id: 'c1', foundryActorId: 'actor-xyz', initiative: null }),
        makeCombatant({ id: 'c2', foundryActorId: 'actor-abc', initiative: null }),
      ],
    });

    const result = applyFoundryInitiativeUpdate([enc], 'actor-xyz', 18);

    expect(result[0].combatants.find((c) => c.id === 'c1')?.initiative).toBe(18);
    expect(result[0].combatants.find((c) => c.id === 'c2')?.initiative).toBeNull();
  });

  it('stamps updatedAt on changed encounters', () => {
    const enc = makeEncounter({
      id: 'enc-1',
      combatants: [makeCombatant({ id: 'c1', foundryActorId: 'actor-xyz', initiative: null })],
    });
    const before = enc.updatedAt;

    const result = applyFoundryInitiativeUpdate([enc], 'actor-xyz', 12);

    expect(result[0].updatedAt).not.toBe(before);
  });

  it('returns the same array reference when no combatant matches', () => {
    const enc = makeEncounter({
      id: 'enc-1',
      combatants: [makeCombatant({ id: 'c1', foundryActorId: 'actor-xyz' })],
    });
    const encounters = [enc];

    const result = applyFoundryInitiativeUpdate(encounters, 'actor-unknown', 10);

    expect(result).toBe(encounters);
  });

  it('does not touch encounters that have no matching combatant', () => {
    const enc1 = makeEncounter({
      id: 'enc-1',
      combatants: [makeCombatant({ id: 'c1', foundryActorId: 'actor-xyz' })],
    });
    const enc2 = makeEncounter({
      id: 'enc-2',
      combatants: [makeCombatant({ id: 'c2', foundryActorId: 'actor-abc' })],
    });

    const result = applyFoundryInitiativeUpdate([enc1, enc2], 'actor-xyz', 14);

    expect(result[0]).not.toBe(enc1);
    expect(result[1]).toBe(enc2);
  });

  it('causes the tracker to re-sort when initiative updates', () => {
    // Verifies that sortedCombatants re-orders after applyFoundryInitiativeUpdate.
    const enc = makeEncounter({
      id: 'enc-1',
      combatants: [
        makeCombatant({ id: 'monster', kind: 'monster', displayName: 'Goblin', initiative: 8, initiativeMod: 2 }),
        makeCombatant({ id: 'pc', kind: 'pc', displayName: 'Serafine', foundryActorId: 'actor-pc', initiative: null }),
      ],
    });

    // Before: monster goes first (only one with a roll), PC is unrolled
    const beforeOrder = sortedCombatants(enc.combatants);
    expect(beforeOrder[0].id).toBe('monster');
    expect(beforeOrder[1].id).toBe('pc');

    // Player rolls initiative 20 in Foundry → event arrives
    const [updated] = applyFoundryInitiativeUpdate([enc], 'actor-pc', 20);
    const afterOrder = sortedCombatants(updated.combatants);

    // After: PC with 20 should be first, monster with 8 second
    expect(afterOrder[0].id).toBe('pc');
    expect(afterOrder[0].initiative).toBe(20);
    expect(afterOrder[1].id).toBe('monster');
  });
});
