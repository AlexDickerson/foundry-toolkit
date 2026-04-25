import type { WebSocketClient } from '@/transport';

// Intercepts pf2e's ChoiceSet dialog (PickAThingPrompt) and forwards
// the choice request to the character-creator frontend via the
// bridge. The frontend renders its own modal, posts the selection
// back, and the server relays the answer here — we write it onto
// the pf2e Application instance and close it, which fires
// `_onClose` → resolves pf2e's internal promise with our value and
// lets ChoiceSetRuleElement.preCreate continue.
//
// When the intercept is not wired (bridge disconnected, no actor
// being created, response times out), the native Foundry dialog
// stays on screen and the user can answer it there.

interface PickAThingChoice {
  value: string | number | boolean | Record<string, unknown>;
  label: string;
  img?: string;
  group?: string;
}

interface PickAThingPromptApp {
  choices: PickAThingChoice[];
  prompt: string;
  item?: { name?: string; img?: string; uuid?: string } | null;
  options?: { window?: { title?: string } };
  allowNoSelection?: boolean;
  selection: PickAThingChoice | null;
  close(): Promise<unknown>;
}

interface PromptRequestPayload {
  // Compact description the frontend needs to render the modal —
  // we keep the payload plain-JSON to cross the WebSocket.
  title: string;
  prompt: string;
  item: { name: string | null; img: string | null; uuid: string | null };
  allowNoSelection: boolean;
  choices: Array<{
    // `value` can be anything pf2e accepts; the frontend just
    // echoes it back untouched on resolve.
    value: PickAThingChoice['value'];
    label: string;
    img: string | null;
    group: string | null;
  }>;
}

interface PromptResponse {
  // null means the user asked to skip (only valid when
  // allowNoSelection). Anything else should be one of the
  // `value`s from the request.
  value: PickAThingChoice['value'] | null;
}

const HOOK_NAME = 'renderPickAThingPrompt';

// PF2e's DamageModifierDialog lets users toggle modifiers before rolling
// damage. It extends `fav1.api.Application` (not Foundry's Dialog), so the
// generic renderDialog hook never fires for it.
//
// The dialog API (src/module/system/damage/dialog.ts):
//   app.isRolled  — false by default; close() calls #resolve(this.isRolled)
//   Closing with isRolled=false signals CANCEL → damage roll returns null.
//   Closing with isRolled=true  signals PROCEED → damage roll continues.
//
// skipDialog cannot be passed via DamageRollParams (it's not in that type);
// it only lives in DamageDamageContext which is built from user settings.
// So we suppress the dialog at the render hook instead.
//
// NOTE: this hook is intentionally unconditional — it fires whether or not
// a portal client is connected, because the modal would stall Foundry for
// everyone if it were left open with no GM to click it.
interface DamageModifierDialogApp {
  isRolled: boolean;
  close(options?: { force?: boolean }): Promise<void>;
}

export function installPromptInterception(wsClients: readonly WebSocketClient[]): void {
  // @ts-expect-error — Foundry's Hooks global is untyped in this module
  Hooks.on(HOOK_NAME, (app: PickAThingPromptApp) => {
    void handlePrompt(app, wsClients);
  });

  // Suppress PF2e's DamageModifierDialog.
  //
  // The dialog's own activateListeners attaches a submit listener to the
  // outer HTML element:
  //   html.addEventListener("submit", e => { e.preventDefault(); this.isRolled = true; this.close(); });
  //
  // Programmatically clicking button[type=submit] triggers that listener
  // through the normal AppV2 path — isRolled=true → close() → #resolve(true).
  // This is cleaner than calling app.close() externally because AppV2's
  // async close() reliably removes the DOM element when invoked from inside
  // its own listener chain.
  //
  // preRenderDamageModifierDialog was tried but AppV2 uses Hooks.callAll
  // (unlike AppV1's Hooks.call), so returning false does not cancel the
  // render. renderDamageModifierDialog fires reliably with the element in DOM.
  // AppV1's render hook fires with (app, $html) where $html is the jQuery-
  // wrapped root .app element. We remove it from the DOM immediately —
  // before the browser paints — then call close() to resolve the internal
  // Promise so the action completes.
  //
  // Why remove() instead of submitBtn.click():
  //   • PF2e creates one DamageModifierDialog per damage component (base,
  //     splash, persistent …); a single roll may fire this hook 2-3 times.
  //   • AppV1's close() runs a 200 ms slideUp animation.  During that
  //     window game-state updates can trigger re-renders, racing the
  //     animation and leaving a zombie element.
  //   • $html.remove() detaches the node synchronously; slideUp then runs
  //     on a detached element (no-op), state is cleaned up after the timer.
  //
  // isRolled must be true before close() so pf2e's
  //   close() { this.#resolve?.(this.isRolled); }
  // resolves with true ("proceed") not false ("cancel").
  // @ts-expect-error — Hooks is untyped
  Hooks.on('renderDamageModifierDialog', (app: DamageModifierDialogApp, $html: unknown) => {
    console.info('Foundry API Bridge | Suppressing DamageModifierDialog — removing element');
    app.isRolled = true;
    // Detach from DOM synchronously before any browser paint.
    ($html as { remove(): void }).remove();
    // Resolve the internal Promise (completes the action).
    void app.close();
  });

  console.log('Foundry API Bridge | ChoiceSet prompt interception installed');
}

async function handlePrompt(app: PickAThingPromptApp, wsClients: readonly WebSocketClient[]): Promise<void> {
  const connected = wsClients.filter((c) => c.isConnected());
  if (connected.length === 0) {
    // No frontend listening — fall back to the native dialog.
    return;
  }

  const payload: PromptRequestPayload = {
    title: app.options?.window?.title ?? 'Choose',
    prompt: app.prompt,
    item: {
      name: app.item?.name ?? null,
      img: app.item?.img ?? null,
      uuid: app.item?.uuid ?? null,
    },
    allowNoSelection: app.allowNoSelection === true,
    choices: app.choices.map((c) => ({
      value: c.value,
      label: c.label,
      img: c.img ?? null,
      group: c.group ?? null,
    })),
  };

  try {
    // First-response-wins across every connected client. Promise.any
    // resolves with the first fulfillment and only rejects (with
    // AggregateError) if *every* client rejects, in which case we
    // fall through to the native dialog like the single-client case.
    const raw = await Promise.any(connected.map((c) => c.sendEvent('prompt-request', payload)));
    const response = raw as PromptResponse | null;
    if (!response || response.value === null) {
      // User skipped — let pf2e's close-without-selection path run.
      await app.close();
      return;
    }
    const pickedValue = response.value;
    const match = app.choices.find((c) => sameChoiceValue(c.value, pickedValue));
    if (!match) {
      console.warn('Foundry API Bridge | Prompt response did not match any choice', response, payload);
      await app.close();
      return;
    }
    app.selection = match;
    await app.close();
  } catch (err) {
    console.warn('Foundry API Bridge | Prompt intercept failed, falling back to native dialog', err);
    // Leave the dialog alone so the user can pick manually.
  }
}

function sameChoiceValue(a: PickAThingChoice['value'], b: PickAThingChoice['value']): boolean {
  if (a === b) return true;
  // Deep-equal shallow object-valued choices (pf2e's `Record`-shaped
  // selection payloads). Primitive mismatches fall through to false.
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
