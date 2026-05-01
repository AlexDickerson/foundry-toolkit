import { parseChatMessage, type ParseInput } from '@/chat/parse-message';

import strikeAttackFixture from './fixtures/strike-attack.json';
import damageFixture from './fixtures/damage.json';
import skillCheckFixture from './fixtures/skill-check.json';
import savingThrowFixture from './fixtures/saving-throw.json';
import spellCastFixture from './fixtures/spell-cast.json';
import unknownFixture from './fixtures/unknown.json';

// Cast imported JSON to ParseInput — json fixtures include superset fields
// (speaker, author, etc.) that parseChatMessage doesn't read; the cast is safe.
function asInput(fixture: unknown): ParseInput {
  return fixture as ParseInput;
}

describe('parseChatMessage', () => {
  describe('strike attack roll', () => {
    it('returns kind strike-attack', () => {
      const result = parseChatMessage(asInput(strikeAttackFixture));
      expect(result.kind).toBe('strike-attack');
    });

    it('strips HTML from flavor', () => {
      const result = parseChatMessage(asInput(strikeAttackFixture));
      expect(result.kind).toBe('strike-attack');
      if (result.kind !== 'strike-attack') return;
      expect(result.flavor).toBe('Strike: Longsword');
    });

    it('includes a roll-damage chip', () => {
      const result = parseChatMessage(asInput(strikeAttackFixture));
      if (result.kind !== 'strike-attack') return;
      expect(result.chips).toHaveLength(1);
      expect(result.chips[0]?.type).toBe('roll-damage');
    });

    it('extracts target actor and token IDs', () => {
      const result = parseChatMessage(asInput(strikeAttackFixture));
      if (result.kind !== 'strike-attack') return;
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]?.actorId).toBe('targetActor001');
      expect(result.targets[0]?.tokenId).toBe('targetToken001');
    });

    it('extracts outcome from outcomePrecise', () => {
      const result = parseChatMessage(asInput(strikeAttackFixture));
      if (result.kind !== 'strike-attack') return;
      expect(result.targets[0]?.outcome).toBe('criticalSuccess');
    });

    it('produces empty targets when no target in flags', () => {
      const msg = asInput({
        ...strikeAttackFixture,
        flags: {
          pf2e: {
            context: { type: 'attack-roll', actor: 'actor001' },
            origin: { actor: 'actor001', type: 'character' },
          },
        },
      });
      const result = parseChatMessage(msg);
      if (result.kind !== 'strike-attack') return;
      expect(result.targets).toHaveLength(0);
    });
  });

  describe('damage roll', () => {
    it('returns kind damage', () => {
      const result = parseChatMessage(asInput(damageFixture));
      expect(result.kind).toBe('damage');
    });

    it('extracts damage type from formula bracket notation', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0]?.damageType).toBe('slashing');
    });

    it('sums roll totals correctly', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.total).toBe(14);
    });

    it('includes an apply-damage chip', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.chips).toHaveLength(1);
      expect(result.chips[0]?.type).toBe('apply-damage');
    });

    it('handles multiple rolls (multi-type damage)', () => {
      const msg = asInput({
        ...damageFixture,
        rolls: [
          { formula: '2d6[slashing]', total: 8, isCritical: false, isFumble: false, dice: [] },
          { formula: '1d6[fire]', total: 4, isCritical: false, isFumble: false, dice: [] },
        ],
      });
      const result = parseChatMessage(msg);
      if (result.kind !== 'damage') return;
      expect(result.parts).toHaveLength(2);
      expect(result.parts[0]?.damageType).toBe('slashing');
      expect(result.parts[1]?.damageType).toBe('fire');
      expect(result.total).toBe(12);
    });
  });

  describe('skill check', () => {
    it('returns kind skill-check', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      expect(result.kind).toBe('skill-check');
    });

    it('extracts flavor as plain text', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.flavor).toBe('Perception Check');
    });

    it('extracts DC from flags.pf2e.context.dc.value', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.dc).toBe(18);
    });

    it('extracts outcome from outcomePrecise', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.outcome).toBe('success');
    });

    it('emits no chips', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.chips).toHaveLength(0);
    });

    it('omits dc when not present in flags', () => {
      const msg = asInput({
        ...skillCheckFixture,
        flags: {
          pf2e: {
            context: { type: 'skill-check', actor: 'actor001' },
            origin: { actor: 'actor001', type: 'character' },
          },
        },
      });
      const result = parseChatMessage(msg);
      if (result.kind !== 'skill-check') return;
      expect('dc' in result).toBe(false);
    });
  });

  describe('saving throw', () => {
    it('returns kind saving-throw', () => {
      const result = parseChatMessage(asInput(savingThrowFixture));
      expect(result.kind).toBe('saving-throw');
    });

    it('extracts DC and failure outcome', () => {
      const result = parseChatMessage(asInput(savingThrowFixture));
      if (result.kind !== 'saving-throw') return;
      expect(result.dc).toBe(22);
      expect(result.outcome).toBe('failure');
    });

    it('also matches flat-check context type', () => {
      const msg = asInput({
        ...savingThrowFixture,
        flags: { pf2e: { context: { type: 'flat-check' }, origin: { type: 'character' } } },
      });
      const result = parseChatMessage(msg);
      expect(result.kind).toBe('saving-throw');
    });
  });

  describe('spell cast', () => {
    it('returns kind spell-cast when origin.type is spell', () => {
      const result = parseChatMessage(asInput(spellCastFixture));
      expect(result.kind).toBe('spell-cast');
    });

    it('extracts spell name as flavor (plain text)', () => {
      const result = parseChatMessage(asInput(spellCastFixture));
      if (result.kind !== 'spell-cast') return;
      expect(result.flavor).toBe('Magic Missile');
    });

    it('includes full content HTML as description', () => {
      const result = parseChatMessage(asInput(spellCastFixture));
      if (result.kind !== 'spell-cast') return;
      expect(result.description).toContain('force damage');
    });

    it('emits no chips', () => {
      const result = parseChatMessage(asInput(spellCastFixture));
      if (result.kind !== 'spell-cast') return;
      expect(result.chips).toHaveLength(0);
    });
  });

  describe('unknown / fallthrough', () => {
    it('returns kind raw for messages without pf2e context', () => {
      const result = parseChatMessage(asInput(unknownFixture));
      expect(result.kind).toBe('raw');
    });

    it('includes raw content HTML', () => {
      const result = parseChatMessage(asInput(unknownFixture));
      if (result.kind !== 'raw') return;
      expect(result.html).toContain('custom macro');
    });

    it('returns raw for a message with no flags at all', () => {
      const result = parseChatMessage({ id: 'x', isRoll: false, content: '<p>hi</p>' });
      expect(result.kind).toBe('raw');
      if (result.kind !== 'raw') return;
      expect(result.html).toBe('<p>hi</p>');
    });

    it('returns raw when pf2e.context.type is an unrecognised string', () => {
      const result = parseChatMessage({
        id: 'x',
        isRoll: false,
        content: '<p>some future message type</p>',
        flags: { pf2e: { context: { type: 'new-unknown-type' }, origin: { type: 'character' } } },
      });
      expect(result.kind).toBe('raw');
    });
  });

  describe('HTML stripping', () => {
    it('strips HTML tags from flavor', () => {
      const result = parseChatMessage({
        id: 'x',
        isRoll: true,
        flavor: '<strong>Strike</strong>: <em>Longsword</em>',
        flags: { pf2e: { context: { type: 'attack-roll' }, origin: { type: 'character' } } },
      });
      if (result.kind !== 'strike-attack') return;
      expect(result.flavor).toBe('Strike: Longsword');
    });
  });
});
