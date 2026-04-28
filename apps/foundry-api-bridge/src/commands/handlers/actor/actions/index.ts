import { adjustResourceAction } from './adjustResource';
import { adjustConditionAction } from './adjustCondition';
import { rollStatisticAction } from './rollStatistic';
import { craftAction } from './craft';
import { restForTheNightAction } from './restForTheNight';
import { rollStrikeAction } from './rollStrike';
import { rollStrikeDamageAction } from './rollStrikeDamage';
import { postItemToChatAction } from './postItemToChat';
import { addFormulaAction } from './addFormula';
import { removeFormulaAction } from './removeFormula';
import { getSpellcastingAction } from './getSpellcasting';
import { castSpellAction } from './castSpell';
import { transferToPartyAction } from './transferToParty';
import type { ActionHandler } from './types';

// Dispatch table. Adding a new outbound action is a single entry —
// no new command type, no new HTTP route, no SPA api method.
export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  'adjust-resource': adjustResourceAction,
  'adjust-condition': adjustConditionAction,
  'roll-statistic': rollStatisticAction,
  craft: craftAction,
  'rest-for-the-night': restForTheNightAction,
  'roll-strike': rollStrikeAction,
  'roll-strike-damage': rollStrikeDamageAction,
  // Simple "send the item's action card to chat" — same behaviour as
  // the pf2e sheet's "post to chat" button. Distinct from the typed
  // `use-item` command, which runs the full activation pipeline
  // (activities, scaling, consumable charges) and has its own
  // MCP/IPC consumers.
  'post-item-to-chat': postItemToChatAction,
  'add-formula': addFormulaAction,
  'remove-formula': removeFormulaAction,
  'get-spellcasting': getSpellcastingAction,
  'cast-spell': castSpellAction,
  'transfer-to-party': transferToPartyAction,
};
