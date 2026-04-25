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

  it('clicks the submit button so the dialog closes via its own listener', () => {
    installPromptInterception([]);

    const clickMock = jest.fn();
    const submitBtn = { click: clickMock } as unknown as HTMLButtonElement;
    const element = {
      querySelector: jest.fn().mockReturnValue(submitBtn),
    } as unknown as HTMLElement;
    const app = {
      isRolled: false,
      element,
      close: jest.fn().mockResolvedValue(undefined),
    };

    hooksMock.fire('renderDamageModifierDialog', app);

    expect(element.querySelector).toHaveBeenCalledWith('button[type=submit]');
    expect(clickMock).toHaveBeenCalled();
    // The app's own submit listener sets isRolled and closes — we don't do it.
    expect(app.close).not.toHaveBeenCalled();
  });

  it('falls back to direct close when no submit button exists', async () => {
    installPromptInterception([]);

    const element = { querySelector: jest.fn().mockReturnValue(null) } as unknown as HTMLElement;
    const app = {
      isRolled: false,
      element,
      close: jest.fn().mockResolvedValue(undefined),
    };

    hooksMock.fire('renderDamageModifierDialog', app);
    await Promise.resolve();

    expect(app.isRolled).toBe(true);
    expect(app.close).toHaveBeenCalled();
  });
});
