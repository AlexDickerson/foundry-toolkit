// Intercepts generic Foundry Dialog and DialogV2 instances and forwards
// them to any connected player-portal client via the bridge event
// mechanism. The portal renders a spec-driven dialog, the player picks a
// button (and optionally fills form fields), and the bridge resolves the
// original Foundry dialog so the action can complete.
//
// When no client is connected, or when the dialog content is too complex
// to represent (scripts, unsupported input types), the native Foundry
// dialog is left alone so the GM can interact with it directly.
//
// Wire types are locally defined (bridge is standalone, no workspace deps).
// The corresponding consumer-facing types live in
// packages/shared/src/rpc/dialog.ts and are kept in sync by convention.

import type { WebSocketClient } from '@/transport';

// ─── Local wire types ────────────────────────────────────────────────────
// Mirror of packages/shared/src/rpc/dialog.ts — keep in sync.

interface DialogButton {
  id: string;
  label: string;
  isDefault: boolean;
}

interface DialogField {
  name: string;
  type: 'select' | 'checkbox' | 'number' | 'text';
  label: string;
  value: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
}

interface DialogSpec {
  dialogId: string;
  kind: string;
  title: string;
  text: string | null;
  buttons: DialogButton[];
  fields: DialogField[];
}

interface DialogResolution {
  buttonId: string;
  formData: Record<string, string | number | boolean>;
}

// ─── Foundry shape snapshots ─────────────────────────────────────────────
// Narrow shims; easier to mock in tests than full foundry-vtt-types.

interface FoundryDialogButton {
  label?: string;
  icon?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback?: (html: any) => unknown;
}

interface FoundryDialogData {
  title?: string;
  content?: string;
  buttons?: Record<string, FoundryDialogButton>;
  default?: string;
}

export interface FoundryDialogApp {
  constructor: { name: string };
  data?: FoundryDialogData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submit?: (button: FoundryDialogButton) => any;
  close?: () => Promise<unknown>;
}

/** Minimal jQuery-compatible accessor for the rendered dialog HTML.
 *  Abstracted so tests can provide a plain-object mock without jQuery. */
export interface HtmlElement {
  find(selector: string): HtmlElement;
  get(index: 0): HTMLElement | undefined;
  length: number;
  each(fn: (index: number, el: HTMLElement) => void): void;
}

// ─── Suppress allowlist ──────────────────────────────────────────────────
// Dialog titles that are auto-resolved with their default button. These
// must have no meaningful player choice. Intentionally empty — add entries
// only after verifying via follow-up issues.
const SUPPRESS_TITLES: readonly string[] = [];

// ─── Pending dialog state ────────────────────────────────────────────────

interface PendingDialog {
  app: FoundryDialogApp;
  html: HtmlElement;
  spec: DialogSpec;
  timer: ReturnType<typeof setTimeout>;
  /** True once we've dispatched a resolution so a late GM click is a no-op. */
  handled: boolean;
}

// Exported so tests can inspect / manipulate.
export const pendingDialogs = new Map<string, PendingDialog>();

const DIALOG_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — same as BridgeEvent timeout

// ─── Public install API ──────────────────────────────────────────────────

/**
 * Register Foundry hooks that intercept generic Dialog and DialogV2 renders
 * and relay them to connected player-portal clients.
 *
 * Call once during module init with the array of active WS clients.
 */
export function installDialogInterception(wsClients: readonly WebSocketClient[]): void {
  // @ts-expect-error — Hooks is a Foundry global, untyped in this module
  Hooks.on('renderDialog', (app: FoundryDialogApp, html: HtmlElement) => {
    void handleDialog('Dialog', app, html, wsClients);
  });

  // DialogV2 (Foundry V12+) fires a separate hook with the same shape.
  // @ts-expect-error — Hooks is a Foundry global, untyped in this module
  Hooks.on('renderDialogV2', (app: FoundryDialogApp, html: HtmlElement) => {
    void handleDialog('DialogV2', app, html, wsClients);
  });

  console.info('Foundry API Bridge | Dialog interception installed (Dialog, DialogV2)');
}

// ─── Core handler ────────────────────────────────────────────────────────

export async function handleDialog(
  hookKind: string,
  app: FoundryDialogApp,
  html: HtmlElement,
  wsClients: readonly WebSocketClient[],
): Promise<void> {
  const connected = wsClients.filter((c) => c.isConnected());
  if (connected.length === 0) {
    // No frontend reachable — leave the native dialog for the GM.
    return;
  }

  const spec = extractDialogSpec(hookKind, app, html);
  if (!spec) {
    // Content too complex or no buttons — leave native dialog.
    console.warn(
      `Foundry API Bridge | dialog-intercept: could not extract spec for "${app.data?.title ?? '?'}" [${hookKind}], leaving native dialog`,
    );
    return;
  }

  // Suppress allowlist: auto-resolve with the default button.
  if (shouldSuppress(spec)) {
    const defaultBtn = spec.buttons.find((b) => b.isDefault) ?? spec.buttons[0];
    if (defaultBtn) {
      console.info(
        `Foundry API Bridge | dialog-intercept: suppressing "${spec.title}" [${spec.dialogId.slice(0, 8)}] → button "${defaultBtn.id}"`,
      );
      resolveFoundryDialog(spec.dialogId, defaultBtn.id, {}, app, html);
    }
    return;
  }

  const dialogId = spec.dialogId;
  console.info(
    `Foundry API Bridge | dialog-intercept: relaying "${spec.title}" [${dialogId.slice(0, 8)}] kind=${hookKind} buttons=[${spec.buttons.map((b) => b.id).join(',')}]`,
  );

  const timer = setTimeout(() => {
    const entry = pendingDialogs.get(dialogId);
    if (entry && !entry.handled) {
      console.warn(
        `Foundry API Bridge | dialog-intercept: dialog "${spec.title}" [${dialogId.slice(0, 8)}] timed out after ${String(DIALOG_TIMEOUT_MS / 1000)}s — leaving native dialog open`,
      );
      pendingDialogs.delete(dialogId);
    }
  }, DIALOG_TIMEOUT_MS);

  pendingDialogs.set(dialogId, { app, html, spec, timer, handled: false });

  try {
    // First-response-wins across all connected clients (same pattern as
    // the ChoiceSet prompt interceptor).
    const raw = await Promise.any(connected.map((c) => c.sendEvent('dialog-request', spec)));
    const response = raw as { value: DialogResolution | null } | null;
    const resolution = response?.value;

    const entry = pendingDialogs.get(dialogId);
    if (!entry || entry.handled) {
      console.warn(
        `Foundry API Bridge | dialog-intercept: late response for dialog "${spec.title}" [${dialogId.slice(0, 8)}] — ignored`,
      );
      return;
    }

    clearTimeout(entry.timer);
    pendingDialogs.delete(dialogId);
    entry.handled = true;

    if (!resolution) {
      console.info(
        `Foundry API Bridge | dialog-intercept: dialog "${spec.title}" [${dialogId.slice(0, 8)}] dismissed by player — closing`,
      );
      await app.close?.();
      return;
    }

    console.info(
      `Foundry API Bridge | dialog-intercept: dialog "${spec.title}" [${dialogId.slice(0, 8)}] resolved → button "${resolution.buttonId}"`,
    );
    resolveFoundryDialog(dialogId, resolution.buttonId, resolution.formData, app, html);
  } catch (err) {
    const entry = pendingDialogs.get(dialogId);
    if (entry) {
      clearTimeout(entry.timer);
      pendingDialogs.delete(dialogId);
    }
    console.warn(
      `Foundry API Bridge | dialog-intercept: relay failed for "${spec.title}" [${dialogId.slice(0, 8)}], leaving native dialog`,
      err,
    );
    // Leave the dialog open for the GM.
  }
}

// ─── Foundry dialog resolution ───────────────────────────────────────────

export function resolveFoundryDialog(
  dialogId: string,
  buttonId: string,
  formData: Record<string, string | number | boolean>,
  app: FoundryDialogApp,
  html: HtmlElement,
): void {
  const buttons = app.data?.buttons;
  if (!buttons) {
    console.warn(
      `Foundry API Bridge | dialog-intercept: no buttons on app for dialog [${dialogId.slice(0, 8)}] — closing`,
    );
    void app.close?.();
    return;
  }

  const foundryButton = buttons[buttonId];
  if (!foundryButton) {
    console.warn(
      `Foundry API Bridge | dialog-intercept: button "${buttonId}" not found on dialog [${dialogId.slice(0, 8)}] — closing`,
    );
    void app.close?.();
    return;
  }

  // Apply the player's form choices to the rendered HTML before invoking the
  // button callback so it reads the player's values, not Foundry's defaults.
  applyFormData(html, formData);

  try {
    if (typeof app.submit === 'function') {
      app.submit(foundryButton);
    } else {
      // Fallback: invoke callback directly then close.
      foundryButton.callback?.(html);
      void app.close?.();
    }
  } catch (err) {
    console.error(
      `Foundry API Bridge | dialog-intercept: submit failed for button "${buttonId}" on dialog [${dialogId.slice(0, 8)}]`,
      err,
    );
  }
}

// ─── Spec extraction (exported for unit tests) ────────────────────────────

/**
 * Build a DialogSpec from a rendered Foundry Dialog app + its HTML.
 * Returns null when the dialog cannot be represented (no buttons, complex
 * content, or invalid structure).
 */
export function extractDialogSpec(
  kind: string,
  app: FoundryDialogApp,
  html: HtmlElement,
): DialogSpec | null {
  const data = app.data;
  if (!data) return null;

  const rawButtons = data.buttons ?? {};
  const defaultId = data.default ?? '';
  const buttons: DialogButton[] = [];

  for (const [id, btn] of Object.entries(rawButtons)) {
    buttons.push({
      id,
      label: stripHtml(btn.label ?? id),
      isDefault: id === defaultId,
    });
  }

  if (buttons.length === 0) return null;

  const contentHtml = data.content ?? '';
  if (hasComplexContent(contentHtml)) return null;

  const fields = extractFormFields(html);

  return {
    dialogId: generateDialogId(),
    kind,
    title: stripHtml(data.title ?? 'Dialog'),
    text: extractPlainText(contentHtml) || null,
    buttons,
    fields,
  };
}

/** Returns true when the dialog title is in the suppress allowlist. */
export function shouldSuppress(spec: DialogSpec): boolean {
  if (SUPPRESS_TITLES.length === 0) return false;
  const titleLower = spec.title.toLowerCase();
  return SUPPRESS_TITLES.some((t) => titleLower === t.toLowerCase());
}

// ─── HTML / content helpers (exported for unit tests) ────────────────────

/** Strip HTML tags and decode common entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Extract readable plain text from an HTML content string. */
export function extractPlainText(html: string): string {
  return stripHtml(html).replace(/\s+/g, ' ').trim();
}

/**
 * Returns true when the HTML content cannot be represented as a simple
 * spec (inline scripts, unsupported input types).
 */
export function hasComplexContent(html: string): boolean {
  if (/<script[\s>]/i.test(html)) return true;
  if (/<input[^>]+type=["']?\s*(?:file|range|color|date|time|datetime-local|month|week)/i.test(html)) return true;
  return false;
}

/**
 * Pull `<input>`, `<select>`, `<textarea>` elements from the rendered HTML
 * and return their current values as DialogField objects.
 */
export function extractFormFields(html: HtmlElement): DialogField[] {
  const fields: DialogField[] = [];

  try {
    html.find('input, select, textarea').each((_i, el) => {
      // Cast through `unknown` so we can use a consistent duck-typed
      // interface whether `el` comes from a real DOM (browser context)
      // or the plain-object mock used in tests, without fighting the
      // strict no-unnecessary-condition rules for standard DOM types.
      type InputLike = {
        name?: string;
        tagName?: string;
        id?: string;
        type?: string;
        value?: string;
        checked?: boolean;
        options?: Iterable<{ value?: string; text?: string }>;
      };
      const inp = el as unknown as InputLike;
      const name = inp.name ?? '';
      if (!name) return;

      const tagName = (inp.tagName ?? '').toLowerCase();

      if (tagName === 'select') {
        const options = Array.from(inp.options ?? []).map((opt) => ({
          value: opt.value ?? '',
          label: opt.text ?? '',
        }));
        fields.push({
          name,
          type: 'select',
          label: findLabelText(html, name, inp.id ?? '') ?? name,
          value: inp.value ?? '',
          options,
        });
        return;
      }

      const inputType = (inp.type || 'text').toLowerCase();

      if (inputType === 'checkbox') {
        fields.push({
          name,
          type: 'checkbox',
          label: findLabelText(html, name, inp.id ?? '') ?? name,
          value: inp.checked ?? false,
        });
        return;
      }

      if (inputType === 'number') {
        const raw = inp.value ?? '';
        const numVal = raw !== '' ? Number(raw) : 0;
        fields.push({
          name,
          type: 'number',
          label: findLabelText(html, name, inp.id ?? '') ?? name,
          value: Number.isFinite(numVal) ? numVal : 0,
        });
        return;
      }

      if (inputType === 'text' || tagName === 'textarea') {
        fields.push({
          name,
          type: 'text',
          label: findLabelText(html, name, inp.id ?? '') ?? name,
          value: inp.value ?? '',
        });
        return;
      }
      // Other types (hidden, submit, reset …) — skip.
    });
  } catch {
    // Best-effort; field extraction failures don't prevent relay.
  }

  return fields;
}

/**
 * Write the player's form choices back into the rendered HTML element so
 * button callbacks read the correct values when invoked.
 */
export function applyFormData(
  html: HtmlElement,
  formData: Record<string, string | number | boolean>,
): void {
  if (Object.keys(formData).length === 0) return;
  try {
    for (const [name, value] of Object.entries(formData)) {
      const inputs = html.find(`[name="${name}"]`);
      if (inputs.length === 0) continue;
      const el = inputs.get(0);
      if (!el) continue;
      type MutableInput = { type?: string; checked?: boolean; value?: string };
      const mut = el as unknown as MutableInput;
      const inputType = (mut.type || '').toLowerCase();
      if (inputType === 'checkbox') {
        mut.checked = Boolean(value);
      } else {
        mut.value = String(value);
      }
    }
  } catch {
    // Best-effort; if this fails the callback runs with Foundry defaults.
  }
}

// ─── Private helpers ─────────────────────────────────────────────────────

function findLabelText(html: HtmlElement, name: string, id: string): string | null {
  type LabelLike = { textContent?: string | null };
  try {
    if (id) {
      const byFor = html.find(`label[for="${id}"]`);
      if (byFor.length > 0) {
        const el = byFor.get(0);
        if (el) return extractPlainText((el as unknown as LabelLike).textContent ?? '');
      }
    }
    const byName = html.find(`label[for="${name}"]`);
    if (byName.length > 0) {
      const el = byName.get(0);
      if (el) return extractPlainText((el as unknown as LabelLike).textContent ?? '');
    }
  } catch {
    // Best-effort.
  }
  return null;
}

function generateDialogId(): string {
  // Foundry runs in HTTPS context where crypto.randomUUID is always available.
  return crypto.randomUUID();
}
