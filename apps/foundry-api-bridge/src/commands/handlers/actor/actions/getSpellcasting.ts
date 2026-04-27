import type { InvokeActorActionResult } from '@/commands/types';
import type { FoundryActor, SpellPreparationMode } from './types';

// Returns a serializable snapshot of the actor's spellcasting entries
// for the dm-tool combat panel. Includes spells grouped by entry and
// slot state appropriate to each preparation mode.

export function getSpellcastingAction(
  actor: FoundryActor,
  _params: Record<string, unknown>,
): Promise<InvokeActorActionResult> {
  const focus = (actor.system as { resources?: { focus?: { value?: number; max?: number } } }).resources?.focus;
  const focusPoints =
    focus && typeof focus.max === 'number' && focus.max > 0
      ? { value: typeof focus.value === 'number' ? focus.value : 0, max: focus.max }
      : null;

  // Pull all items from the actor via actor.items (a Foundry Collection that
  // always exposes embedded documents with full .system). Avoid
  // actor.spellcasting.contents — it returns synthetic wrappers in current
  // PF2e that don't expose .system directly.
  const allItems: unknown[] = [];
  const itemColl = actor.items as unknown as {
    contents?: unknown[];
    forEach?: (fn: (i: unknown) => void) => void;
  };
  if (Array.isArray(itemColl.contents)) {
    allItems.push(...itemColl.contents);
  } else if (typeof itemColl.forEach === 'function') {
    itemColl.forEach((item) => allItems.push(item));
  }

  function toStr(v: unknown): string {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }
  function itemType(i: unknown): string {
    return typeof (i as Record<string, unknown>)['type'] === 'string'
      ? ((i as Record<string, unknown>)['type'] as string)
      : '';
  }
  function itemSystem(i: unknown): Record<string, unknown> {
    const sys = (i as Record<string, unknown>)['system'];
    return typeof sys === 'object' && sys !== null ? (sys as Record<string, unknown>) : {};
  }
  function nested(obj: Record<string, unknown>, ...keys: string[]): unknown {
    let cur: unknown = obj;
    for (const k of keys) {
      if (typeof cur !== 'object' || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  }

  const entryItems = allItems.filter((i) => itemType(i) === 'spellcastingEntry');
  const spellItems = allItems.filter((i) => itemType(i) === 'spell');

  if (entryItems.length === 0) {
    return Promise.resolve({ actorId: actor.id, entries: [] });
  }

  const entries = entryItems.map((rawEntry) => {
    const entryId = toStr((rawEntry as Record<string, unknown>)['id']);
    const entryName = toStr((rawEntry as Record<string, unknown>)['name']);
    const sys = itemSystem(rawEntry);
    const preparedSys = nested(sys, 'prepared') as Record<string, unknown> | undefined;
    const mode = (preparedSys?.['value'] as SpellPreparationMode | undefined) ?? 'innate';
    const traditionSys = nested(sys, 'tradition') as Record<string, unknown> | undefined;
    const tradition = toStr(traditionSys?.['value']);
    const rawSlots = (nested(sys, 'slots') as Record<string, unknown> | undefined) ?? {};

    type SlotEntry = { max: number; value?: number; prepared?: Array<{ id: string | null; expended?: boolean }> };

    const entrySpells = spellItems.filter((s) => {
      const loc = nested(itemSystem(s), 'location', 'value');
      return loc === entryId;
    });

    const spellSummaries = entrySpells.map((rawSpell) => {
      const spellSys = itemSystem(rawSpell);
      const rank = Number(nested(spellSys, 'level', 'value') ?? 0);
      const rawTraits = nested(spellSys, 'traits', 'value');
      const allTraits = Array.isArray(rawTraits) ? (rawTraits as string[]) : [];
      const isCantrip = allTraits.includes('cantrip');
      const traits = allTraits.filter((t) => t !== 'cantrip');
      const actions = toStr(nested(spellSys, 'time', 'value'));
      const spellId = toStr((rawSpell as Record<string, unknown>)['id']);
      const spellName = toStr((rawSpell as Record<string, unknown>)['name']);
      const range = toStr(nested(spellSys, 'range', 'value'));
      const target = toStr(nested(spellSys, 'target', 'value'));

      const areaRaw = nested(spellSys, 'area') as Record<string, unknown> | null | undefined;
      let area = '';
      if (areaRaw && typeof areaRaw === 'object') {
        const aVal = areaRaw['value'];
        const aType = areaRaw['type'];
        if (aVal !== undefined && aVal !== '' && aVal !== 0) {
          area = `${toStr(aVal)}-foot${aType ? ` ${toStr(aType)}` : ''}`;
        }
      }

      // Description ships as raw Foundry HTML (with @UUID / @Damage / etc.
      // enricher tokens). Consumers run it through enrichDescription() from
      // @foundry-toolkit/shared/foundry-enrichers before rendering.
      const description = toStr(nested(spellSys, 'description', 'value'));

      let expended: boolean | undefined;
      if (mode === 'prepared') {
        const slotKey = `slot${rank.toString()}`;
        const slot = rawSlots[slotKey] as SlotEntry | undefined;
        expended =
          slot?.prepared?.find((p: { id: string | null; expended?: boolean }) => p.id === spellId)?.expended ?? false;
      }

      return { id: spellId, name: spellName, rank, isCantrip, actions, expended, traits, range, area, target, description };
    });

    // Slot state for spontaneous casters.
    let slots: Array<{ rank: number; value: number; max: number }> | undefined;
    if (mode === 'spontaneous') {
      slots = Object.entries(rawSlots)
        .map(([key, slotRaw]) => {
          const slot = slotRaw as SlotEntry;
          return {
            rank: parseInt(key.replace('slot', ''), 10),
            value: slot.value ?? 0,
            max: slot.max,
          };
        })
        .filter((s) => !isNaN(s.rank) && s.max > 0)
        .sort((a, b) => a.rank - b.rank);
    }

    return {
      id: entryId,
      name: entryName,
      mode,
      tradition,
      spells: spellSummaries,
      ...(slots !== undefined ? { slots } : {}),
      ...(mode === 'focus' && focusPoints !== null ? { focusPoints } : {}),
    };
  });

  return Promise.resolve({ actorId: actor.id, entries });
}
