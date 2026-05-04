import { describe, it, expect } from 'vitest';
import { readBackgroundPath, buildSheetSurfaceStyle } from './sheetBackground';
import type { PreparedCharacter } from '../api/types';

function makeCharacter(flags?: Record<string, Record<string, unknown>>): PreparedCharacter {
  return {
    id: 'test-id',
    uuid: 'Actor.test-id',
    name: 'Test',
    type: 'character',
    img: '',
    system: {} as PreparedCharacter['system'],
    items: [],
    ...(flags !== undefined ? { flags } : {}),
  };
}

describe('readBackgroundPath', () => {
  it('returns null when flags are absent', () => {
    expect(readBackgroundPath(makeCharacter())).toBeNull();
  });

  it('returns null when the character-creator scope is missing', () => {
    expect(readBackgroundPath(makeCharacter({ other: { foo: 'bar' } }))).toBeNull();
  });

  it('returns null when backgroundImage is null', () => {
    expect(readBackgroundPath(makeCharacter({ 'character-creator': { backgroundImage: null } }))).toBeNull();
  });

  it('returns null when backgroundImage is an empty string', () => {
    expect(readBackgroundPath(makeCharacter({ 'character-creator': { backgroundImage: '' } }))).toBeNull();
  });

  it('returns the path as-is when it already uses forward slashes', () => {
    const path = 'modules/character-creator-bg/actor123-1234567890.jpeg';
    expect(readBackgroundPath(makeCharacter({ 'character-creator': { backgroundImage: path } }))).toBe(path);
  });

  it('normalizes Windows backslash paths stored by an older upload on Windows', () => {
    const stored = 'modules\\character-creator-bg\\actor123-1234567890.jpeg';
    const result = readBackgroundPath(makeCharacter({ 'character-creator': { backgroundImage: stored } }));
    expect(result).toBe('modules/character-creator-bg/actor123-1234567890.jpeg');
  });
});

describe('buildSheetSurfaceStyle', () => {
  it('returns undefined for null path', () => {
    expect(buildSheetSurfaceStyle(null)).toBeUndefined();
  });

  it('prepends a leading slash when the path is relative', () => {
    const style = buildSheetSurfaceStyle('modules/character-creator-bg/actor-ts.jpeg');
    expect(style?.backgroundImage).toContain('url(/modules/character-creator-bg/actor-ts.jpeg)');
  });

  it('does not double-prepend when the path already starts with /', () => {
    const style = buildSheetSurfaceStyle('/modules/character-creator-bg/actor-ts.jpeg');
    expect(style?.backgroundImage).toContain('url(/modules/character-creator-bg/actor-ts.jpeg)');
    expect(style?.backgroundImage).not.toContain('url(//');
  });

  it('sets cover background-size', () => {
    const style = buildSheetSurfaceStyle('modules/character-creator-bg/actor.png');
    expect(style?.backgroundSize).toBe('cover');
  });
});
