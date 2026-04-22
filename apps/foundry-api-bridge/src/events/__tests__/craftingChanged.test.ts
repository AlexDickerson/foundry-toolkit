import { craftingChanged } from '../EventChannelController';

describe('craftingChanged', () => {
  it('returns true for a nested system.crafting diff', () => {
    expect(craftingChanged({ system: { crafting: { formulas: [] } } })).toBe(true);
  });

  it('returns true for dot-notation system.crafting keys', () => {
    expect(craftingChanged({ 'system.crafting.formulas': [] })).toBe(true);
  });

  it('returns true even when the crafting value is empty/null', () => {
    // Foundry sends `null` to clear sub-documents; still a crafting change.
    expect(craftingChanged({ system: { crafting: null } })).toBe(true);
  });

  it('returns false for unrelated system updates', () => {
    expect(craftingChanged({ system: { attributes: { hp: { value: 10 } } } })).toBe(false);
  });

  it('returns false for dot-notation updates on other system paths', () => {
    expect(craftingChanged({ 'system.attributes.hp.value': 10 })).toBe(false);
  });

  it('returns false for non-object input', () => {
    expect(craftingChanged(null)).toBe(false);
    expect(craftingChanged(undefined)).toBe(false);
    expect(craftingChanged('system.crafting')).toBe(false);
  });

  it('returns false when system exists but crafting is absent', () => {
    expect(craftingChanged({ system: { attributes: {} } })).toBe(false);
  });
});
