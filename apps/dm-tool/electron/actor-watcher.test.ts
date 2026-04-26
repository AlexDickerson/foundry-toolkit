import { describe, expect, it } from 'vitest';
import { parseActorsEvent } from './actor-watcher';

describe('parseActorsEvent', () => {
  it('parses a valid event', () => {
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
