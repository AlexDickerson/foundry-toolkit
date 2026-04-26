import { describe, expect, it } from 'vitest';
import { enrichDescription } from './foundry-enrichers';

describe('enrichDescription', () => {
  // ─── @UUID ───────────────────────────────────────────────────────────────

  it('rewrites @UUID with label as a styled anchor', () => {
    const out = enrichDescription('@UUID[Compendium.pf2e.spell-effects.Item.abc]{Spell Effect: Dancing Shield}');
    expect(out).toContain('class="pf-uuid-link"');
    expect(out).toContain('Spell Effect: Dancing Shield');
    expect(out).toContain('data-uuid="Compendium.pf2e.spell-effects.Item.abc"');
  });

  it('falls back to a type segment when @UUID has no label', () => {
    const out = enrichDescription('@UUID[Compendium.pf2e.spells.Item.xyz]');
    expect(out).toContain('class="pf-uuid-link"');
    // Fallback uses second-to-last path segment.
    expect(out).toContain('>Item<');
  });

  // ─── @Damage ─────────────────────────────────────────────────────────────

  it('formats @Damage tokens to plain readable text', () => {
    const out = enrichDescription('takes @Damage[2d6[fire]]{2d6 fire damage}');
    expect(out).toContain('class="pf-damage"');
    expect(out).toContain('2d6 fire damage');
  });

  it('formats unlabelled @Damage by joining dice and types', () => {
    const out = enrichDescription('@Damage[1d8[bludgeoning]]');
    expect(out).toContain('1d8 bludgeoning');
  });

  // ─── @Template ───────────────────────────────────────────────────────────

  it('renders @Template as italic shape descriptor', () => {
    const out = enrichDescription('@Template[emanation|distance:15]');
    expect(out).toContain('class="pf-template"');
    expect(out).toContain('15-foot emanation');
  });

  // ─── @Check ──────────────────────────────────────────────────────────────

  it('renders @Check with type and DC', () => {
    const out = enrichDescription('@Check[fortitude|dc:25|basic:true]');
    expect(out).toContain('class="pf-damage"');
    expect(out).toContain('basic DC 25 Fortitude save');
  });

  it('renders @Check with against:X without echoing target name in the visible label', () => {
    const out = enrichDescription('@Check[will|against:intimidation]');
    // Visible label is just "Will" — the original token is preserved in title for debugging.
    expect(out).toMatch(/>Will</);
  });

  // ─── Heightening ─────────────────────────────────────────────────────────

  it('heightens the first @Damage by per-step dice', () => {
    const out = enrichDescription('@Damage[2d4[fire]]', {
      heightening: { delta: 2, perStep: '2d4' },
    });
    // 2d4 base + 2 steps × 2d4 = 6d4
    expect(out).toContain('6d4 fire');
    expect(out).toContain('pf-damage-heightened');
  });

  it('falls back to plain-text damage rewrite when no @Damage token present', () => {
    const out = enrichDescription('The spell deals 1d6 fire damage to the target.', {
      heightening: { delta: 3, perStep: '1d6' },
    });
    // 1d6 base + 3 steps × 1d6 = 4d6
    expect(out).toContain('4d6');
    expect(out).toContain('pf-damage-heightened');
  });

  // ─── Idempotence on plain text ───────────────────────────────────────────

  it('returns plain text unchanged when there are no enricher tokens', () => {
    const input = 'A simple spell description with no special markup.';
    expect(enrichDescription(input)).toBe(input);
  });

  // ─── Block-italic normalisation ──────────────────────────────────────────

  it('strips paragraph-level italic wrappers', () => {
    const out = enrichDescription('<p><em>Flavour intro paragraph.</em></p>');
    expect(out).toBe('<p>Flavour intro paragraph.</p>');
  });
});
