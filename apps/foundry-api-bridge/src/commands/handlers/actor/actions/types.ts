import type { InvokeActorActionResult } from '@/commands/types';
import type { FoundryD20Roll } from '../actorTypes';

// Minimal Foundry type snippets. Kept local to the actions layer because
// the pf2e runtime surface isn't covered by the bundled foundry-vtt
// types and we narrow defensively from `unknown` anyway.

export interface FoundryActor {
  id: string;
  uuid: string;
  type: string;
  system: Record<string, unknown> & {
    /** PF2e system caches prepared strike/action objects on the
     *  character here. Shape is `{slug, variants: [{roll()}], damage(),
     *  critical()}`. Loose typing because the surface is runtime-only. */
    actions?: Pf2eStrike[];
  };
  items: FoundryItemCollection;
  update(data: Record<string, unknown>): Promise<FoundryActor>;
  /** PF2e-specific: bumps a condition by 1 (creates the effect at
   *  value 1 if absent). */
  increaseCondition?: (slug: string) => Promise<unknown>;
  /** PF2e-specific: drops a condition value by 1; removes the
   *  effect when it hits 0. */
  decreaseCondition?: (slug: string) => Promise<unknown>;
  /** PF2e-specific: unified `Statistic` accessor — perception, saves,
   *  every skill. Returns null when the statistic isn't defined
   *  (e.g. loot actors). */
  getStatistic?: (slug: string) => Pf2eStatistic | null;
}

export interface Pf2eStatistic {
  roll(args: {
    skipDialog?: boolean;
    createMessage?: boolean;
    rollMode?: string;
  }): Promise<FoundryD20Roll | null>;
}

export interface Pf2eStrikeVariant {
  roll(args: Record<string, unknown>): Promise<unknown>;
}

export interface Pf2eStrike {
  slug: string;
  variants?: Pf2eStrikeVariant[];
  damage?: (args: Record<string, unknown>) => Promise<unknown>;
  critical?: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface FoundryItem {
  id: string;
  name: string;
  type: string;
  toMessage(args?: Record<string, unknown>): Promise<unknown>;
}

export interface FoundryItemCollection {
  get(id: string): FoundryItem | undefined;
}

export interface ActorsCollection {
  get(id: string): FoundryActor | undefined;
}

export type PF2eActionFn = (options: Record<string, unknown>) => Promise<unknown>;

export interface FoundryGame {
  actors: ActorsCollection;
  messages?: { contents: Array<{ id: string; isRoll?: boolean }> };
  pf2e?: {
    actions?: Record<string, PF2eActionFn | undefined>;
  };
}

export interface FoundryGlobals {
  game: FoundryGame;
}

export function getFoundry(): FoundryGlobals {
  return globalThis as unknown as FoundryGlobals;
}

// Per-action handler signature. Receives the resolved actor + the
// untyped params bag from the request; returns whatever structured
// result makes sense for the action (opaque to the router).
export type ActionHandler = (actor: FoundryActor, params: Record<string, unknown>) => Promise<InvokeActorActionResult>;

// Spell-related types shared by get-spellcasting and cast-spell.
export type SpellPreparationMode = 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'ritual' | 'items';

export interface Pf2eSpellcasting {
  get(id: string): Pf2eSpellcastingEntry | undefined;
}

export interface Pf2eSpellcastingEntry {
  cast(spell: Pf2eSpellItem, opts: { rank?: number; slot?: number }): Promise<unknown>;
}

export interface Pf2eSpellItem {
  id: string;
  name: string;
  type: string;
  system: {
    level: { value: number };
    traits: { value: string[] };
    time?: { value: string };
    location?: { value: string | null };
  };
}

export interface Pf2eActorWithSpells extends FoundryActor {
  spellcasting?: Pf2eSpellcasting;
}
