import { describe, it, expect } from 'vitest';
import { firstError, primarySpeed, humaniseSlug } from './helpers';
import type { ActorActionState } from '../../../lib/useActorAction';

describe('firstError', () => {
  it('returns null when all states are idle', () => {
    expect(firstError('idle', 'idle')).toBeNull();
  });

  it('returns null when states are idle or pending', () => {
    expect(firstError('idle', 'pending')).toBeNull();
  });

  it('returns the error message from the first errored state', () => {
    const errored: ActorActionState = { error: 'something went wrong' };
    expect(firstError('idle', errored, { error: 'second error' })).toBe('something went wrong');
  });

  it('returns null for empty args', () => {
    expect(firstError()).toBeNull();
  });
});

describe('primarySpeed', () => {
  const baseSpeed = { label: 'Land Speed', type: 'land' as const };

  it('returns land speed when present', () => {
    const speeds = { land: { ...baseSpeed, value: 25 } } as Parameters<typeof primarySpeed>[0];
    expect(primarySpeed(speeds)).toBe('25 ft');
  });

  it('returns first non-land speed when no land speed', () => {
    const speeds = { swim: { label: 'Swim Speed', type: 'swim' as const, value: 15 } } as Parameters<typeof primarySpeed>[0];
    expect(primarySpeed(speeds)).toBe('15 ft');
  });

  it('returns em dash when speeds is empty', () => {
    expect(primarySpeed({} as Parameters<typeof primarySpeed>[0])).toBe('—');
  });
});

describe('humaniseSlug', () => {
  it('capitalises a single word', () => {
    expect(humaniseSlug('fire')).toBe('Fire');
  });

  it('splits on hyphens and capitalises each word', () => {
    expect(humaniseSlug('fire-damage')).toBe('Fire Damage');
  });

  it('handles multiple hyphens', () => {
    expect(humaniseSlug('piercing-and-slashing')).toBe('Piercing And Slashing');
  });
});
