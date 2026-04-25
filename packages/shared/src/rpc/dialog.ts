// Wire types for the dialog relay feature. These are shared between
// foundry-api-bridge (which serialises Foundry dialogs) and player-portal
// (which renders them and sends back resolutions). They ride the existing
// BridgeEvent / prompt-stream mechanism in foundry-mcp — no server changes
// required.
//
// Event kinds:
//   bridge → portal  : {bridgeId, type: 'dialog-request', payload: DialogSpec}
//   portal → bridge  : POST /api/prompts/:bridgeId/resolve  {value: DialogResolution}

// ─── Spec (bridge → portal) ────────────────────────────────────────────

export interface DialogButton {
  /** Unique within this dialog. Must be echoed back in DialogResolution.buttonId. */
  id: string;
  /** Display label (HTML stripped). */
  label: string;
  /** True when this is the dialog's default / primary button. */
  isDefault: boolean;
}

/**
 * A form field extracted from the dialog's rendered HTML. For v1 only
 * `select`, `checkbox`, `number`, and `text` inputs are supported;
 * complex types fall back to suppression (the intercept doesn't relay
 * the field, but the button options are still shown).
 */
export interface DialogField {
  /** The `name` attribute of the input element. */
  name: string;
  type: 'select' | 'checkbox' | 'number' | 'text';
  label: string;
  /** Current (default) value at the time the dialog rendered. */
  value: string | number | boolean;
  /** Only present when type === 'select'. */
  options?: Array<{ value: string; label: string }>;
}

/**
 * Serialised representation of a Foundry Dialog sent from the bridge to
 * player-portal so the player can interact with it in-browser.
 *
 * dialogId is identical to the bridgeId used by the BridgeEvent envelope —
 * kept here for self-contained lookups in the frontend without needing to
 * decode the outer envelope each time.
 */
export interface DialogSpec {
  /** Same as the enclosing BridgeEvent.bridgeId. */
  dialogId: string;
  /** Source class that produced the dialog ('Dialog', 'DialogV2',
   *  'CheckDialogPF2e', etc.). Informational only — used in logging. */
  kind: string;
  title: string;
  /** Plain text extracted from the dialog content (HTML stripped).
   *  Null when the content is empty or purely structural. */
  text: string | null;
  buttons: DialogButton[];
  /** Extracted form fields. Empty when the dialog has no form or only
   *  contains unsupported field types. */
  fields: DialogField[];
}

// ─── Resolution (portal → bridge) ──────────────────────────────────────

/**
 * The player's response to a dialog-request. Sent as the `value` field
 * of the resolvePromptBody POST to /api/prompts/:bridgeId/resolve.
 */
export interface DialogResolution {
  /** Must match one of the DialogSpec.buttons[].id values. */
  buttonId: string;
  /** Values for the form fields indexed by DialogField.name. */
  formData: Record<string, string | number | boolean>;
}

// ─── Bridge event type constants ────────────────────────────────────────

/** BridgeEvent.type for ChoiceSet (PickAThingPrompt) prompts. */
export const BRIDGE_EVENT_PROMPT_REQUEST = 'prompt-request' as const;
/** BridgeEvent.type for generic Foundry Dialog / DialogV2 prompts. */
export const BRIDGE_EVENT_DIALOG_REQUEST = 'dialog-request' as const;

export type BridgeEventKind = typeof BRIDGE_EVENT_PROMPT_REQUEST | typeof BRIDGE_EVENT_DIALOG_REQUEST;
