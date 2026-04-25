import { installPromptInterception } from '@/creator/prompt-intercept';
import type { WebSocketClient } from '@/transport/WebSocketClient';

interface HookRecord {
  name: string;
  fn: (...args: unknown[]) => unknown;
}

class HooksMock {
  registered: HookRecord[] = [];
  on(name: string, fn: (...args: unknown[]) => unknown): number {
    this.registered.push({ name, fn });
    return this.registered.length;
  }
  off(): void {
    // Unused for these tests; controller tear-down is exercised elsewhere.
  }
  fire(name: string, ...args: unknown[]): void {
    for (const h of this.registered.filter((h) => h.name === name)) {
      h.fn(...args);
    }
  }
  /** Fire a hook and return the return-value of the first matching handler. */
  fireReturn(name: string, ...args: unknown[]): unknown {
    const handlers = this.registered.filter((h) => h.name === name);
    let lastReturn: unknown;
    for (const h of handlers) {
      lastReturn = h.fn(...args);
    }
    return lastReturn;
  }
}

let hooksMock: HooksMock;

beforeEach(() => {
  hooksMock = new HooksMock();
  (global as unknown as Record<string, unknown>)['Hooks'] = hooksMock;
});

interface FakeClient {
  stub: WebSocketClient;
  sendEvent: jest.Mock;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

function makeClient(connected = true): FakeClient {
  let resolve!: (value: unknown) => void;
  let reject!: (err: Error) => void;
  const pending = new Promise<unknown>((r, rj) => {
    resolve = r;
    reject = rj;
  });
  const sendEvent = jest.fn(() => pending);
  const stub = {
    isConnected: () => connected,
    sendEvent,
  } as unknown as WebSocketClient;
  return { stub, sendEvent, resolve, reject };
}

function makePromptApp(): {
  app: { choices: { value: string; label: string }[]; prompt: string; selection: unknown; close: jest.Mock };
  choices: { value: string; label: string }[];
} {
  const choices = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];
  return {
    app: {
      choices,
      prompt: 'Pick',
      selection: null,
      close: jest.fn().mockResolvedValue(undefined),
    },
    choices,
  };
}

// Yield long enough for all pending Promise.any resolution to land.
// Two microtask cycles cover: (1) sendEvent mock resolution, (2)
// Promise.any internal await.
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('installPromptInterception', () => {
  it('takes the first fulfilled response across clients', async () => {
    const slow = makeClient();
    const fast = makeClient();
    installPromptInterception([slow.stub, fast.stub]);

    const { app, choices } = makePromptApp();
    hooksMock.fire('renderPickAThingPrompt', app);

    expect(slow.sendEvent).toHaveBeenCalledTimes(1);
    expect(fast.sendEvent).toHaveBeenCalledTimes(1);

    fast.resolve({ value: 'b' });
    await flushMicrotasks();

    expect(app.selection).toBe(choices[1]);
    expect(app.close).toHaveBeenCalled();
  });

  it('ignores rejections as long as one client responds', async () => {
    const failing = makeClient();
    const winner = makeClient();
    installPromptInterception([failing.stub, winner.stub]);

    const { app, choices } = makePromptApp();
    hooksMock.fire('renderPickAThingPrompt', app);

    failing.reject(new Error('disconnected'));
    winner.resolve({ value: 'a' });
    await flushMicrotasks();

    expect(app.selection).toBe(choices[0]);
  });

  it('falls through to the native dialog when no clients are connected', async () => {
    const offline = makeClient(false);
    installPromptInterception([offline.stub]);

    const { app } = makePromptApp();
    hooksMock.fire('renderPickAThingPrompt', app);
    await flushMicrotasks();

    expect(offline.sendEvent).not.toHaveBeenCalled();
    expect(app.close).not.toHaveBeenCalled();
    expect(app.selection).toBeNull();
  });

  it('leaves the native dialog alone when every client rejects', async () => {
    const a = makeClient();
    const b = makeClient();
    installPromptInterception([a.stub, b.stub]);

    const { app } = makePromptApp();
    hooksMock.fire('renderPickAThingPrompt', app);

    a.reject(new Error('gone'));
    b.reject(new Error('gone'));
    await flushMicrotasks();

    // Promise.any → AggregateError → caught → native dialog survives.
    expect(app.close).not.toHaveBeenCalled();
    expect(app.selection).toBeNull();
  });

  it('closes without a selection when the winning response says value=null', async () => {
    const a = makeClient();
    installPromptInterception([a.stub]);

    const { app } = makePromptApp();
    hooksMock.fire('renderPickAThingPrompt', app);

    a.resolve({ value: null });
    await flushMicrotasks();

    expect(app.close).toHaveBeenCalled();
    expect(app.selection).toBeNull();
  });
});

// ─── DamageModifierDialog suppression ────────────────────────────────────
//
// Clicks button[type=submit] inside app.element to trigger the dialog's own
// submit listener: isRolled=true → this.close() through the AppV2 internal
// path, which reliably removes the DOM element.

describe('installPromptInterception — renderDamageModifierDialog', () => {
  it('registers a renderDamageModifierDialog hook', () => {
    installPromptInterception([]);
    const names = hooksMock.registered.map((h) => h.name);
    expect(names).toContain('renderDamageModifierDialog');
  });

  it('removes the element from DOM and calls close() to resolve the Promise', async () => {
    installPromptInterception([]);

    const removeMock = jest.fn();
    const $html = { remove: removeMock };
    const app = { isRolled: false, close: jest.fn().mockResolvedValue(undefined) };

    hooksMock.fire('renderDamageModifierDialog', app, $html);
    await Promise.resolve();

    // isRolled set before close so #resolve(true) signals "proceed".
    expect(app.isRolled).toBe(true);
    // Element detached before browser paint.
    expect(removeMock).toHaveBeenCalled();
    // Promise resolved (action completes).
    expect(app.close).toHaveBeenCalled();
  });

  it('sets isRolled before calling close() so the roll is not cancelled', async () => {
    installPromptInterception([]);

    const callOrder: string[] = [];
    const $html = { remove: jest.fn() };
    const app = {
      isRolled: false,
      close: jest.fn().mockImplementation(() => {
        callOrder.push(`close:isRolled=${String(app.isRolled)}`);
        return Promise.resolve();
      }),
    };
    Object.defineProperty(app, 'isRolled', {
      get() { return this._isRolled ?? false; },
      set(v: boolean) {
        callOrder.push(`setIsRolled:${String(v)}`);
        this._isRolled = v;
      },
    });

    hooksMock.fire('renderDamageModifierDialog', app, $html);
    await Promise.resolve();

    expect(callOrder[0]).toBe('setIsRolled:true');
    expect(callOrder[1]).toMatch(/^close:isRolled=true/);
  });
});

// ─── CheckDialogPF2e suppression ─────────────────────────────────────────
//
// PF2e's CheckDialogPF2e (attack / check modifier prompt) resolves its
// internal Promise by submitting its form, not by calling close() directly.
// Calling close() would cancel the roll (resolves with null). The hook
// removes the element from the DOM (prevent flash) then dispatches a submit
// event on the detached form so the activateListeners handler fires and the
// roll proceeds with the form's default (zero) modifier values.

describe('installPromptInterception — renderCheckDialogPF2e', () => {
  it('registers a renderCheckDialogPF2e hook', () => {
    installPromptInterception([]);
    const names = hooksMock.registered.map((h) => h.name);
    expect(names).toContain('renderCheckDialogPF2e');
  });

  it('removes the element from DOM and dispatches submit on the form', () => {
    installPromptInterception([]);

    const removeMock = jest.fn();
    const dispatchMock = jest.fn();
    const formEl = { dispatchEvent: dispatchMock };
    const $html = {
      remove: removeMock,
      find: jest.fn().mockImplementation((selector: string) => ({
        get: (i: number): unknown => (selector === 'form' && i === 0 ? formEl : undefined),
      })),
    };
    const app = { close: jest.fn().mockResolvedValue(undefined) };

    hooksMock.fire('renderCheckDialogPF2e', app, $html);

    expect(removeMock).toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'submit' }));
    // close() must NOT be called: it would resolve with null (cancel the roll).
    expect(app.close).not.toHaveBeenCalled();
  });

  it('removes DOM before dispatching submit to prevent visual flash', () => {
    installPromptInterception([]);

    const callOrder: string[] = [];
    const formEl = {
      dispatchEvent: jest.fn(() => { callOrder.push('submit'); }),
    };
    const $html = {
      remove: jest.fn(() => { callOrder.push('remove'); }),
      find: jest.fn().mockImplementation((selector: string) => ({
        get: (i: number): unknown => (selector === 'form' && i === 0 ? formEl : undefined),
      })),
    };
    const app = { close: jest.fn().mockResolvedValue(undefined) };

    hooksMock.fire('renderCheckDialogPF2e', app, $html);

    expect(callOrder).toEqual(['remove', 'submit']);
  });

  it('falls back to clicking button[type="submit"] when no form element exists', () => {
    installPromptInterception([]);

    const removeMock = jest.fn();
    const clickMock = jest.fn();
    const btn = { click: clickMock };
    const $html = {
      remove: removeMock,
      find: jest.fn().mockImplementation((selector: string) => ({
        get: (i: number): unknown =>
          selector === 'button[type="submit"]' && i === 0 ? btn : undefined,
      })),
    };
    const app = { close: jest.fn().mockResolvedValue(undefined) };

    hooksMock.fire('renderCheckDialogPF2e', app, $html);

    expect(removeMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(app.close).not.toHaveBeenCalled();
  });

  it('calls app.close() as a last resort when neither form nor button is found', async () => {
    installPromptInterception([]);

    const $html = {
      remove: jest.fn(),
      find: jest.fn().mockReturnValue({ get: (): undefined => undefined }),
    };
    const app = { close: jest.fn().mockResolvedValue(undefined) };

    hooksMock.fire('renderCheckDialogPF2e', app, $html);
    await Promise.resolve();

    expect(app.close).toHaveBeenCalled();
  });

  it('does not call app.close() when the form submit path succeeds', () => {
    installPromptInterception([]);

    const $html = {
      remove: jest.fn(),
      find: jest.fn().mockImplementation((selector: string) => ({
        get: (i: number): unknown =>
          selector === 'form' && i === 0 ? { dispatchEvent: jest.fn() } : undefined,
      })),
    };
    const app = { close: jest.fn().mockResolvedValue(undefined) };

    hooksMock.fire('renderCheckDialogPF2e', app, $html);

    expect(app.close).not.toHaveBeenCalled();
  });
});
