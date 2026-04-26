import { describe, it, expect } from 'vitest';
import { PARTY_ACTOR_NAME, isAlreadyInEncounter, togglePartySelection } from './party-picker-utils';

// ─── Folder-name configuration ────────────────────────────────────────────────

describe('PARTY_ACTOR_NAME', () => {
  it('defaults to "The Party"', () => {
    expect(PARTY_ACTOR_NAME).toBe('The Party');
  });
});

// ─── Filter predicate ─────────────────────────────────────────────────────────

describe('isAlreadyInEncounter', () => {
  const member = { id: 'actor-1', name: 'Amiri' };

  it('returns true when a PC combatant has the same foundryActorId', () => {
    const combatants = [{ kind: 'pc', displayName: 'Renamed Hero', foundryActorId: 'actor-1' }];
    expect(isAlreadyInEncounter(combatants, member)).toBe(true);
  });

  it('returns true when a PC combatant has the same displayName (legacy/no actor id)', () => {
    const combatants = [{ kind: 'pc', displayName: 'Amiri' }];
    expect(isAlreadyInEncounter(combatants, member)).toBe(true);
  });

  it('returns false when foundryActorId differs and displayName differs', () => {
    const combatants = [{ kind: 'pc', displayName: 'Harsk', foundryActorId: 'actor-2' }];
    expect(isAlreadyInEncounter(combatants, member)).toBe(false);
  });

  it('returns false for a monster combatant with the same name', () => {
    const combatants = [{ kind: 'monster', displayName: 'Amiri' }];
    expect(isAlreadyInEncounter(combatants, member)).toBe(false);
  });

  it('returns false for an empty encounter', () => {
    expect(isAlreadyInEncounter([], member)).toBe(false);
  });

  it('returns true even when other combatants exist', () => {
    const combatants = [
      { kind: 'monster', displayName: 'Goblin' },
      { kind: 'pc', displayName: 'Amiri' },
      { kind: 'pc', displayName: 'Harsk' },
    ];
    expect(isAlreadyInEncounter(combatants, member)).toBe(true);
  });

  it('is case-sensitive on the displayName fallback (display names are user-typed)', () => {
    const combatants = [{ kind: 'pc', displayName: 'amiri' }];
    expect(isAlreadyInEncounter(combatants, member)).toBe(false);
  });

  it('matches by id even when displayName has been edited', () => {
    const combatants = [{ kind: 'pc', displayName: 'Sal the Bard', foundryActorId: 'actor-1' }];
    expect(isAlreadyInEncounter(combatants, member)).toBe(true);
  });
});

// ─── Picker selection state ───────────────────────────────────────────────────

describe('togglePartySelection', () => {
  it('adds an id that is not yet selected', () => {
    const next = togglePartySelection(new Set(), 'actor-1');
    expect(next.has('actor-1')).toBe(true);
  });

  it('removes an id that is already selected', () => {
    const next = togglePartySelection(new Set(['actor-1']), 'actor-1');
    expect(next.has('actor-1')).toBe(false);
  });

  it('does not mutate the original set', () => {
    const original = new Set(['actor-1', 'actor-2']);
    togglePartySelection(original, 'actor-3');
    expect(original.size).toBe(2);
  });

  it('leaves other ids in the set when toggling one out', () => {
    const next = togglePartySelection(new Set(['actor-1', 'actor-2']), 'actor-1');
    expect(next.has('actor-2')).toBe(true);
    expect(next.has('actor-1')).toBe(false);
  });

  it('leaves other ids in the set when toggling one in', () => {
    const next = togglePartySelection(new Set(['actor-1']), 'actor-2');
    expect(next.has('actor-1')).toBe(true);
    expect(next.has('actor-2')).toBe(true);
  });

  it('returns a new Set instance every time', () => {
    const original = new Set(['actor-1']);
    const next = togglePartySelection(original, 'actor-2');
    expect(next).not.toBe(original);
  });
});
