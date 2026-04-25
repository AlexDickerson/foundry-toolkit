import { describe, expect, it } from 'vitest';
import { coloredIconKey, normalizeIconColor, parseIconKey } from './icons';

// ---------------------------------------------------------------------------
// normalizeIconColor
// ---------------------------------------------------------------------------

describe('normalizeIconColor', () => {
  it('returns empty string for undefined', () => {
    expect(normalizeIconColor(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeIconColor('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeIconColor('   ')).toBe('');
  });

  it('accepts a 6-digit hex and lowercases it', () => {
    expect(normalizeIconColor('#FF0000')).toBe('#ff0000');
    expect(normalizeIconColor('#AABBCC')).toBe('#aabbcc');
    expect(normalizeIconColor('#f98c10')).toBe('#f98c10');
  });

  it('accepts a 3-digit hex and lowercases it', () => {
    expect(normalizeIconColor('#F00')).toBe('#f00');
    expect(normalizeIconColor('#abc')).toBe('#abc');
  });

  it('accepts an 8-digit hex (with alpha channel)', () => {
    expect(normalizeIconColor('#FF0000FF')).toBe('#ff0000ff');
  });

  it('trims surrounding whitespace before checking', () => {
    expect(normalizeIconColor('  #ff0000  ')).toBe('#ff0000');
  });

  it('returns empty string for CSS named colours', () => {
    expect(normalizeIconColor('red')).toBe('');
    expect(normalizeIconColor('blue')).toBe('');
    expect(normalizeIconColor('goldenrod')).toBe('');
  });

  it('returns empty string for hsl() / rgb() strings', () => {
    expect(normalizeIconColor('hsl(0,100%,50%)')).toBe('');
    expect(normalizeIconColor('rgb(255,0,0)')).toBe('');
  });

  it('returns empty string for malformed hex (wrong length)', () => {
    expect(normalizeIconColor('#12345')).toBe(''); // 5 hex digits
    expect(normalizeIconColor('#1234567')).toBe(''); // 7 hex digits
  });

  it('returns empty string for hex missing the leading #', () => {
    expect(normalizeIconColor('ff0000')).toBe('');
  });

  it('returns empty string for hex with invalid characters', () => {
    expect(normalizeIconColor('#gg0000')).toBe('');
    expect(normalizeIconColor('#zzzzzz')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// coloredIconKey
// ---------------------------------------------------------------------------

describe('coloredIconKey', () => {
  it('returns bare gi-<name> when colour is empty string', () => {
    expect(coloredIconKey('crossed-swords', '')).toBe('gi-crossed-swords');
  });

  it('returns gi-<name>::<color> when colour is set', () => {
    expect(coloredIconKey('crossed-swords', '#ff0000')).toBe('gi-crossed-swords::#ff0000');
  });

  it('handles multi-segment icon names', () => {
    expect(coloredIconKey('arrow-cluster', '#00ff00')).toBe('gi-arrow-cluster::#00ff00');
  });

  it('uses default key format (no colour suffix) for empty colour', () => {
    // Ensures backward-compatible keys work with existing cached images.
    expect(coloredIconKey('skull', '')).toBe('gi-skull');
  });
});

// ---------------------------------------------------------------------------
// parseIconKey
// ---------------------------------------------------------------------------

describe('parseIconKey', () => {
  it('returns null for strings that do not start with gi-', () => {
    expect(parseIconKey('crossed-swords')).toBeNull();
    expect(parseIconKey('foo')).toBeNull();
    expect(parseIconKey('')).toBeNull();
    expect(parseIconKey('maplibre-image')).toBeNull();
  });

  it('parses a bare gi-<name> key (no colour)', () => {
    expect(parseIconKey('gi-crossed-swords')).toEqual({ name: 'crossed-swords', color: '' });
  });

  it('parses the special gi-default key', () => {
    expect(parseIconKey('gi-default')).toEqual({ name: 'default', color: '' });
  });

  it('parses a coloured gi-<name>::<color> key', () => {
    expect(parseIconKey('gi-crossed-swords::#ff0000')).toEqual({ name: 'crossed-swords', color: '#ff0000' });
  });

  it('parses a coloured default dot key', () => {
    expect(parseIconKey('gi-default::#f98c10')).toEqual({ name: 'default', color: '#f98c10' });
  });

  it('handles multi-segment icon names with colour', () => {
    expect(parseIconKey('gi-arrow-cluster::#00ff00')).toEqual({ name: 'arrow-cluster', color: '#00ff00' });
  });

  it('round-trips through coloredIconKey', () => {
    const name = 'skull';
    const color = '#e03c31';
    const key = coloredIconKey(name, color);
    expect(parseIconKey(key)).toEqual({ name, color });
  });

  it('round-trips a bare (no-colour) key', () => {
    const name = 'dragon';
    const key = coloredIconKey(name, '');
    expect(parseIconKey(key)).toEqual({ name, color: '' });
  });
});
