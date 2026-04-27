import { ACTION_HANDLERS } from '../index';

const EXPECTED_ACTIONS = [
  'adjust-resource',
  'adjust-condition',
  'roll-statistic',
  'craft',
  'rest-for-the-night',
  'roll-strike',
  'roll-strike-damage',
  'post-item-to-chat',
  'add-formula',
  'remove-formula',
  'get-spellcasting',
  'cast-spell',
] as const;

describe('ACTION_HANDLERS registry', () => {
  it('contains every expected action name', () => {
    for (const name of EXPECTED_ACTIONS) {
      expect(ACTION_HANDLERS).toHaveProperty(name);
    }
  });

  it('registers exactly the expected set — no extras or gaps', () => {
    expect(Object.keys(ACTION_HANDLERS).sort()).toEqual([...EXPECTED_ACTIONS].sort());
  });

  it('maps every action name to a function', () => {
    for (const fn of Object.values(ACTION_HANDLERS)) {
      expect(typeof fn).toBe('function');
    }
  });
});
