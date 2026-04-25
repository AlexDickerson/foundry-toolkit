import { describe, expect, it } from 'vitest';
import { formatSkills } from './monster-skills';

describe('formatSkills', () => {
  // -----------------------------------------------------------------------
  // Plain string path (current projection output)
  // -----------------------------------------------------------------------

  it('formats a plain skill string unchanged when no +0 entries are present', () => {
    expect(formatSkills('Stealth +12, Arcana +8')).toBe('Stealth +12, Arcana +8');
  });

  it('removes a +0 skill from the middle of a plain string', () => {
    expect(formatSkills('Stealth +12, Athletics +0, Arcana +8')).toBe('Stealth +12, Arcana +8');
  });

  it('removes a +0 skill at the start of a plain string', () => {
    expect(formatSkills('+0Skills +0, Stealth +12')).toBe('Stealth +12');
  });

  it('removes a +0 skill at the end of a plain string', () => {
    expect(formatSkills('Stealth +12, Acrobatics +0')).toBe('Stealth +12');
  });

  it('keeps negative modifier skills', () => {
    expect(formatSkills('Intimidation -2, Acrobatics +5')).toBe('Intimidation -2, Acrobatics +5');
  });

  it('returns an empty string when all plain-string skills are +0', () => {
    expect(formatSkills('Athletics +0, Acrobatics +0')).toBe('');
  });

  it('handles a single non-zero skill', () => {
    expect(formatSkills('Stealth +5')).toBe('Stealth +5');
  });

  it('handles a single +0 skill (returns empty string)', () => {
    expect(formatSkills('Acrobatics +0')).toBe('');
  });

  it('returns empty string for an empty input', () => {
    expect(formatSkills('')).toBe('');
  });

  // -----------------------------------------------------------------------
  // JSON path (legacy DB)
  // -----------------------------------------------------------------------

  it('parses JSON skills and formats them', () => {
    expect(formatSkills('{"stealth":12,"arcana":8}')).toBe('Stealth +12, Arcana +8');
  });

  it('filters out +0 skills from JSON', () => {
    expect(formatSkills('{"stealth":12,"athletics":0,"arcana":8}')).toBe('Stealth +12, Arcana +8');
  });

  it('keeps negative modifier skills from JSON', () => {
    expect(formatSkills('{"intimidation":-2,"acrobatics":5}')).toBe('Intimidation -2, Acrobatics +5');
  });

  it('returns empty string when all JSON skills are zero', () => {
    expect(formatSkills('{"athletics":0,"acrobatics":0}')).toBe('');
  });

  it('capitalises the first letter of JSON skill keys', () => {
    expect(formatSkills('{"loreLibrary":3}')).toBe('LoreLibrary +3');
  });
});
