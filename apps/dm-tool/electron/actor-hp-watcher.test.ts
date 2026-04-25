import { describe, expect, it } from 'vitest';
import { isHpPath, parseActorsEvent } from './actor-hp-watcher';

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

describe('parseActorsEvent', () => {
  it('parses a valid HP update event', () => {
    const raw = '{"actorId":"abc123","changedPaths":["system.attributes.hp.value"]}';
    expect(parseActorsEvent(raw)).toEqual({
      actorId: 'abc123',
      changedPaths: ['system.attributes.hp.value'],
    });
  });

  it('parses an event with multiple changed paths', () => {
    const raw = '{"actorId":"xyz","changedPaths":["system.attributes.hp.value","system.attributes.hp.temp"]}';
    const evt = parseActorsEvent(raw);
    expect(evt?.actorId).toBe('xyz');
    expect(evt?.changedPaths).toHaveLength(2);
  });

  it('returns null for non-JSON input', () => {
    expect(parseActorsEvent(': ping')).toBeNull();
    expect(parseActorsEvent('not json')).toBeNull();
    expect(parseActorsEvent('')).toBeNull();
  });

  it('returns null when actorId is missing', () => {
    expect(parseActorsEvent('{"changedPaths":["system.attributes.hp.value"]}')).toBeNull();
  });

  it('returns null when actorId is not a string', () => {
    expect(parseActorsEvent('{"actorId":42,"changedPaths":["system.attributes.hp.value"]}')).toBeNull();
  });

  it('returns null when changedPaths is not an array', () => {
    expect(parseActorsEvent('{"actorId":"abc","changedPaths":"bad"}')).toBeNull();
  });

  it('returns null when changedPaths is missing', () => {
    expect(parseActorsEvent('{"actorId":"abc"}')).toBeNull();
  });
});
