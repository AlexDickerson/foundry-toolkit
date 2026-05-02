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
      // Foundry UUIDs include the document-type prefix
      expect(result.targets[0]?.actorId).toBe('Actor.targetActor001');
      expect(result.targets[0]?.tokenId).toBe('Scene.scene001.Token.targetToken001');
    });

    it('extracts outcome from context.outcome', () => {
      const result = parseChatMessage(asInput(strikeAttackFixture));
      if (result.kind !== 'strike-attack') return;
      expect(result.targets[0]?.outcome).toBe('criticalSuccess');
    });

    it('produces empty targets when context.target is null', () => {
      const msg = asInput({
        ...strikeAttackFixture,
        flags: {
          pf2e: {
            context: { type: 'attack-roll', actor: 'Actor.actor001', target: null, outcome: null },
            origin: { actor: 'Actor.actor001', type: 'character' },
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

    it('extracts damage type from trailing word in formula', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0]?.damageType).toBe('slashing');
    });

    it('stores the roll total correctly', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.total).toBe(9);
    });

    it('includes an apply-damage chip', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.chips).toHaveLength(1);
      expect(result.chips[0]?.type).toBe('apply-damage');
    });

    it('extracts outcome from context.outcome', () => {
      const result = parseChatMessage(asInput(damageFixture));
      if (result.kind !== 'damage') return;
      expect(result.outcome).toBe('success');
    });

    it('handles crit-doubled formula "2 * (1d6 + 6) bludgeoning"', () => {
      const msg = asInput({
        ...damageFixture,
        rolls: [{ formula: '2 * (1d6 + 6) bludgeoning', total: 16, dice: [] }],
        flags: { pf2e: { context: { type: 'damage-roll', outcome: 'criticalSuccess', target: null } } },
      });
      const result = parseChatMessage(msg);
      if (result.kind !== 'damage') return;
      expect(result.parts[0]?.damageType).toBe('bludgeoning');
      expect(result.total).toBe(16);
      expect(result.outcome).toBe('criticalSuccess');
    });

    it('handles multiple rolls (multi-type damage)', () => {
      const msg = asInput({
        ...damageFixture,
        rolls: [
          { formula: '2d6 slashing', total: 8, dice: [] },
          { formula: '1d6 fire', total: 4, dice: [] },
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

    it('extracts DC from context.dc.value', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.dc).toBe(18);
    });

    it('extracts outcome from context.outcome', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.outcome).toBe('success');
    });

    it('emits no chips', () => {
      const result = parseChatMessage(asInput(skillCheckFixture));
      if (result.kind !== 'skill-check') return;
      expect(result.chips).toHaveLength(0);
    });

    it('omits dc and outcome when context fields are null', () => {
      const msg = asInput({
        ...skillCheckFixture,
        flags: {
          pf2e: { context: { type: 'skill-check', actor: 'Actor.actor001', dc: null, outcome: null } },
        },
      });
      const result = parseChatMessage(msg);
      if (result.kind !== 'skill-check') return;
      expect('dc' in result).toBe(false);
      expect('outcome' in result).toBe(false);
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
        flags: { pf2e: { context: { type: 'flat-check', outcome: null, dc: null, target: null } } },
      });
      const result = parseChatMessage(msg);
      expect(result.kind).toBe('saving-throw');
    });
  });

  describe('spell cast', () => {
    it('returns kind spell-cast when context.type is spell-cast', () => {
      const result = parseChatMessage(asInput(spellCastFixture));
      expect(result.kind).toBe('spell-cast');
    });

    it('extracts spell name from <h3> in content (flavor is empty in real messages)', () => {
      const result = parseChatMessage(asInput(spellCastFixture));
      if (result.kind !== 'spell-cast') return;
      expect(result.flavor).toBe('Magic Missile');
    });

    it('also matches when origin.type is spell (fallback detection)', () => {
      const msg = asInput({
        ...spellCastFixture,
        flags: {
          pf2e: { context: { type: 'something-else', outcome: null }, origin: { type: 'spell' } },
        },
      });
      // 'something-else' context type doesn't match any handler, but origin.type === 'spell' does
      // NOTE: the primary check wins (attack-roll, etc. take precedence) — origin.type is fallback
      // This message has no recognised context type so origin.type catches it.
      const result = parseChatMessage(msg);
      expect(result.kind).toBe('spell-cast');
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
        flavor: '<h4 class="action"><strong>Strike</strong>: <em>Longsword</em></h4>',
        flags: { pf2e: { context: { type: 'attack-roll', target: null, outcome: null, dc: null } } },
      });
      if (result.kind !== 'strike-attack') return;
      expect(result.flavor).toBe('Strike: Longsword');
    });
  });
});
