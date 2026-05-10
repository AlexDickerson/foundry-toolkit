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

  // ─── @actor.* formula humanizer ──────────────────────────────────────────
  // pf2e level-scaling formulas can't be evaluated client-side without an
  // actor context (compendium previews, picker hovers); rewrite them to
  // compact symbolic forms instead of leaking the raw `@actor.level` syntax.

  it('humanizes (max(1, (ceil(@actor.level/N))))dM formulas', () => {
    const out = enrichDescription('they recover (max(1, (ceil(@actor.level/2))))d8 healing Hit Points');
    expect(out).toContain('⌈L/2⌉d8');
    expect(out).not.toContain('@actor.level');
  });

  it('humanizes the no-inner-paren variant max(1, ceil(...))', () => {
    const out = enrichDescription('damage equal to (max(1, ceil(@actor.level/4)))d6');
    expect(out).toContain('⌈L/4⌉d6');
  });

  it('humanizes (ceil(@actor.level/N))dM without the max wrapper', () => {
    const out = enrichDescription('deals (ceil(@actor.level/3))d10 damage');
    expect(out).toContain('⌈L/3⌉d10');
  });

  it('humanizes (floor(@actor.level/N))dM with floor brackets', () => {
    const out = enrichDescription('regains (floor(@actor.level/2))d6 HP');
    expect(out).toContain('⌊L/2⌋d6');
  });

  it('humanizes (@actor.level)dM as LdM', () => {
    const out = enrichDescription('takes (@actor.level)d4 damage');
    expect(out).toContain('Ld4');
  });

  it('replaces standalone @actor.level with L', () => {
    const out = enrichDescription('your hit points equal @actor.level × 5');
    expect(out).toContain('L × 5');
    expect(out).not.toContain('@actor.level');
  });

  it('humanizes formulas inside an inline-roll label', () => {
    // pf2e wraps these formulas in [[/r ...]]{label} where the label is
    // often the raw expression. Our inline-roll handler outputs the label
    // inside a pf-damage span; the final humanizer pass cleans it up.
    const out = enrichDescription(
      '[[/r {max(1,ceil(@actor.level/2))}d8 #healing]]{(max(1, (ceil(@actor.level/2))))d8}',
    );
    expect(out).toContain('⌈L/2⌉d8');
    expect(out).not.toContain('@actor.level');
  });
});
