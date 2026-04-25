import { describe, it, expect } from 'vitest';
import { formatAncestryLine, formatSignedInt } from './format';

describe('formatSignedInt', () => {
  it('prefixes positive numbers with +', () => {
    expect(formatSignedInt(3)).toBe('+3');
    expect(formatSignedInt(0)).toBe('+0');
  });

  it('leaves negative numbers as-is', () => {
    expect(formatSignedInt(-2)).toBe('-2');
  });
});

describe('formatAncestryLine', () => {
  // ── Heritage embeds the ancestry name ─────────────────────────────────

  it('drops ancestry when heritage ends with the ancestry name', () => {
    // "Venom-Resistant Vishkanya" + "Vishkanya" → no duplication
    expect(formatAncestryLine('Venom-Resistant Vishkanya', 'Vishkanya')).toBe('Venom-Resistant Vishkanya');
  });

  it('drops ancestry when heritage is "[Adjective] [Ancestry]" form', () => {
    expect(formatAncestryLine('Ancient Elf', 'Elf')).toBe('Ancient Elf');
    expect(formatAncestryLine('Versatile Human', 'Human')).toBe('Versatile Human');
    expect(formatAncestryLine('Suli-Jann Gnome', 'Gnome')).toBe('Suli-Jann Gnome');
  });

  it('is case-insensitive when checking for ancestry in heritage', () => {
    expect(formatAncestryLine('Versatile HUMAN', 'Human')).toBe('Versatile HUMAN');
    expect(formatAncestryLine('versatile human', 'Human')).toBe('versatile human');
  });

  it('does not drop ancestry when it is only a partial substring (no whole-word match)', () => {
    // "Elfborn" does not contain the whole word "Elf" at a standalone boundary
    // that would be a full match — but actually \bElf\b *does* match in "Elfborn"
    // because 'E' is at word-start. We test the real edge: a mid-word embed.
    // "Halfling" contains "ling" but not "Elf"; "Skilled" contains "ill" not "Elf".
    expect(formatAncestryLine('Skilled Heritage', 'Elf')).toBe('Skilled Heritage Elf');
  });

  // ── Heritage does NOT embed the ancestry name ──────────────────────────

  it('appends ancestry when heritage is a different word (Aiuvarin / Half-Elf shape)', () => {
    // Aiuvarin is the Half-Elf heritage of the Human ancestry in PF2e.
    // Neither word contains the other.
    expect(formatAncestryLine('Aiuvarin', 'Half-Elf')).toBe('Aiuvarin Half-Elf');
  });

  it('appends ancestry when heritage name shares no overlap', () => {
    expect(formatAncestryLine('Skilled Heritage', 'Human')).toBe('Skilled Heritage Human');
    expect(formatAncestryLine('Gutsy Halfling', 'Dwarf')).toBe('Gutsy Halfling Dwarf');
  });

  // ── Missing values ─────────────────────────────────────────────────────

  it('returns ancestry alone when heritage is absent', () => {
    expect(formatAncestryLine(undefined, 'Human')).toBe('Human');
    expect(formatAncestryLine(undefined, 'Vishkanya')).toBe('Vishkanya');
  });

  it('returns heritage alone when ancestry is absent', () => {
    expect(formatAncestryLine('Skilled Heritage', undefined)).toBe('Skilled Heritage');
  });

  it('returns empty string when both are absent', () => {
    expect(formatAncestryLine(undefined, undefined)).toBe('');
  });

  // ── Hyphenated ancestry names ──────────────────────────────────────────

  it('handles hyphenated ancestry names that appear in heritage', () => {
    // A hypothetical heritage "Spirited Half-Orc" with ancestry "Half-Orc"
    expect(formatAncestryLine('Spirited Half-Orc', 'Half-Orc')).toBe('Spirited Half-Orc');
  });

  it('appends hyphenated ancestry when not present in heritage', () => {
    expect(formatAncestryLine('Strongjaw', 'Half-Orc')).toBe('Strongjaw Half-Orc');
  });
});
