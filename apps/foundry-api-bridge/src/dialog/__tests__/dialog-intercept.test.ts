import {
  extractDialogSpec,
  shouldSuppress,
  hasComplexContent,
  stripHtml,
  extractPlainText,
  extractFormFields,
  applyFormData,
  handleDialog,
  pendingDialogs,
  type FoundryDialogApp,
  type HtmlElement,
} from '@/dialog/dialog-intercept';
import type { WebSocketClient } from '@/transport/WebSocketClient';

// ─── Mocks ────────────────────────────────────────────────────────────────

beforeEach(() => {
  (global as unknown as Record<string, unknown>)['Hooks'] = {
    on: jest.fn(),
  };
  pendingDialogs.clear();
  let counter = 0;
  (global as unknown as Record<string, unknown>)['crypto'] = {
    randomUUID: () => `test-uuid-${String(++counter).padStart(4, '0')}`,
  };
});

afterEach(() => {
  for (const entry of pendingDialogs.values()) {
    clearTimeout(entry.timer);
  }
  pendingDialogs.clear();
});

// ─── Test-only lightweight HTML element builder ────────────────────────────
// Builds a mock HtmlElement tree from a descriptor without needing jsdom.

interface InputDescriptor {
  tagName: 'input' | 'select' | 'textarea';
  type?: string;
  name: string;
  id?: string;
  value?: string;
  checked?: boolean;
  options?: Array<{ value: string; text: string; selected?: boolean }>;
  labelFor?: string;    // text of an associated label element
}

interface LabelDescriptor {
  for: string;
  text: string;
}

/**
 * Builds a minimal HtmlElement that mimics jQuery's .find() / .get() / .each()
 * surface without a real DOM, sufficient for exercising extractFormFields /
 * applyFormData in a plain-node environment.
 */
function buildHtml(inputs: InputDescriptor[] = [], labels: LabelDescriptor[] = []): HtmlElement {
  // Represent each element as a plain object with the properties our code reads.
  type FakeEl = {
    tagName: string;
    name?: string;
    id?: string;
    type?: string;
    value: string;
    checked: boolean;
    textContent?: string;
    options?: Array<{ value: string; text: string }>;
    _forAttr?: string; // for label[for] lookup
  };

  const inputEls: FakeEl[] = inputs.map((d) => {
    if (d.tagName === 'select') {
      const selected = d.options?.find((o) => o.selected);
      return {
        tagName: 'select',
        name: d.name,
        id: d.id ?? '',
        value: selected?.value ?? d.options?.[0]?.value ?? '',
        checked: false,
        options: d.options ?? [],
      };
    }
    return {
      tagName: d.tagName,
      name: d.name,
      id: d.id ?? '',
      type: d.type ?? (d.tagName === 'textarea' ? '' : 'text'),
      value: d.value ?? '',
      checked: d.checked ?? false,
    };
  });

  const labelEls: FakeEl[] = labels.map((l) => ({
    tagName: 'label',
    name: undefined,
    _forAttr: l.for,
    value: '',
    checked: false,
    textContent: l.text,
  }));

  const allEls: FakeEl[] = [...inputEls, ...labelEls];

  function makeList(els: FakeEl[]): HtmlElement {
    return {
      length: els.length,
      get(index: 0): HTMLElement | undefined {
        return els[index] as unknown as HTMLElement | undefined;
      },
      find(selector: string): HtmlElement {
        // Match "input, select, textarea" or `label[for="..."]` or `[name="..."]`
        if (selector === 'input, select, textarea') {
          return makeList(inputEls);
        }
        const forMatch = /^label\[for="([^"]+)"\]$/.exec(selector);
        if (forMatch) {
          const forVal = forMatch[1];
          return makeList(labelEls.filter((l) => l._forAttr === forVal));
        }
        const nameMatch = /^\[name="([^"]+)"\]$/.exec(selector);
        if (nameMatch) {
          const nameVal = nameMatch[1];
          return makeList(inputEls.filter((el) => el.name === nameVal));
        }
        return makeList([]);
      },
      each(fn: (index: number, el: HTMLElement) => void): void {
        els.forEach((el, i) => fn(i, el as unknown as HTMLElement));
      },
    };
  }

  return makeList([{ tagName: 'div', value: '', checked: false, ...({} as FakeEl) }, ...allEls].slice(1));
  // Simplification: treat the root as a container that delegates .find() to allEls.
  // Actually we need a real root:
}

function buildHtmlRoot(inputs: InputDescriptor[], labels: LabelDescriptor[] = []): HtmlElement {
  type FakeEl = {
    tagName: string;
    name?: string;
    id?: string;
    type?: string;
    value: string;
    checked: boolean;
    textContent?: string;
    options?: Array<{ value: string; text: string }>;
    _forAttr?: string;
  };

  const inputEls: FakeEl[] = inputs.map((d) => {
    if (d.tagName === 'select') {
      const selected = d.options?.find((o) => o.selected);
      return {
        tagName: 'select',
        name: d.name,
        id: d.id ?? '',
        value: selected?.value ?? d.value ?? d.options?.[0]?.value ?? '',
        checked: false,
        options: d.options ?? [],
      };
    }
    return {
      tagName: d.tagName,
      name: d.name,
      id: d.id ?? '',
      type: d.type ?? (d.tagName === 'textarea' ? '' : 'text'),
      value: d.value ?? '',
      checked: d.checked ?? false,
    };
  });

  const labelEls: FakeEl[] = labels.map((l) => ({
    tagName: 'label',
    _forAttr: l.for,
    value: '',
    checked: false,
    textContent: l.text,
  }));

  function makeList(els: FakeEl[]): HtmlElement {
    return {
      length: els.length,
      get(index: 0): HTMLElement | undefined {
        return els[index] as unknown as HTMLElement | undefined;
      },
      find(selector: string): HtmlElement {
        if (selector === 'input, select, textarea') {
          return makeList(inputEls);
        }
        const forMatch = /^label\[for="([^"]+)"\]$/.exec(selector);
        if (forMatch) {
          const forVal = forMatch[1]!;
          return makeList(labelEls.filter((l) => l._forAttr === forVal));
        }
        const nameMatch = /^\[name="([^"]+)"\]$/.exec(selector);
        if (nameMatch) {
          const nameVal = nameMatch[1]!;
          return makeList(inputEls.filter((el) => el.name === nameVal));
        }
        return makeList([]);
      },
      each(fn: (index: number, el: HTMLElement) => void): void {
        els.forEach((el, i) => fn(i, el as unknown as HTMLElement));
      },
    };
  }

  // The root element wraps everything; .find delegates into inputs+labels.
  return makeList([...inputEls, ...labelEls]).find(''); // use the full list as root
}

// Override the find-all case for the root node.
function makeRoot(inputs: InputDescriptor[], labels: LabelDescriptor[] = []): HtmlElement {
  type FakeEl = {
    tagName: string;
    name?: string;
    id?: string;
    type?: string;
    value: string;
    checked: boolean;
    textContent?: string;
    options?: Array<{ value: string; text: string }>;
    _forAttr?: string;
  };

  const inputEls: FakeEl[] = inputs.map((d) => {
    if (d.tagName === 'select') {
      const selected = d.options?.find((o) => o.selected);
      return {
        tagName: 'select',
        name: d.name,
        id: d.id ?? '',
        value: selected?.value ?? d.value ?? d.options?.[0]?.value ?? '',
        checked: false,
        options: d.options ?? [],
      };
    }
    return {
      tagName: d.tagName,
      name: d.name,
      id: d.id ?? '',
      type: d.type ?? (d.tagName === 'textarea' ? '' : 'text'),
      value: d.value ?? '',
      checked: d.checked ?? false,
    };
  });

  const labelEls: FakeEl[] = labels.map((l) => ({
    tagName: 'label',
    _forAttr: l.for,
    value: '',
    checked: false,
    textContent: l.text,
  }));

  function makeList(els: FakeEl[]): HtmlElement {
    return {
      length: els.length,
      get(index: 0): HTMLElement | undefined {
        return els[index] as unknown as HTMLElement | undefined;
      },
      find(selector: string): HtmlElement {
        if (selector === 'input, select, textarea') {
          return makeList(inputEls);
        }
        const forMatch = /^label\[for="([^"]+)"\]$/.exec(selector);
        if (forMatch) {
          const forVal = forMatch[1]!;
          return makeList(labelEls.filter((l) => l._forAttr === forVal));
        }
        const nameMatch = /^\[name="([^"]+)"\]$/.exec(selector);
        if (nameMatch) {
          const nameVal = nameMatch[1]!;
          return makeList(inputEls.filter((el) => el.name === nameVal));
        }
        return makeList([]);
      },
      each(fn: (index: number, el: HTMLElement) => void): void {
        els.forEach((el, i) => fn(i, el as unknown as HTMLElement));
      },
    };
  }

  return {
    length: 1,
    get: () => undefined,
    find(selector: string): HtmlElement {
      return makeList([...inputEls, ...labelEls]).find(selector);
    },
    each: () => undefined,
  };
}

function makeEmptyHtml(): HtmlElement {
  return makeRoot([]);
}

function makeAppWithButtons(
  title = 'Test Dialog',
  buttons: Record<string, { label: string; callback?: jest.Mock }> = { ok: { label: 'OK' } },
  defaultBtn = 'ok',
  content = '<p>Are you sure?</p>',
): FoundryDialogApp {
  return {
    constructor: { name: 'Dialog' },
    data: { title, content, buttons, default: defaultBtn },
    submit: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ─── Pure helper tests ────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('strips tags', () => {
    expect(stripHtml('<b>Bold</b>')).toBe('Bold');
  });

  it('decodes common entities', () => {
    expect(stripHtml('a &amp; b &lt;c&gt;')).toBe('a & b <c>');
  });

  it('trims surrounding whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello');
  });
});

describe('extractPlainText', () => {
  it('collapses multiple spaces and strips tags', () => {
    expect(extractPlainText('<p>Hello</p>   <p>World</p>')).toBe('Hello World');
  });

  it('returns empty string for purely structural HTML', () => {
    expect(extractPlainText('<div><br/></div>')).toBe('');
  });
});

describe('hasComplexContent', () => {
  it('flags inline <script> tags', () => {
    expect(hasComplexContent('<script>alert(1)</script>')).toBe(true);
    expect(hasComplexContent('<script type="text/javascript">doThing()</script>')).toBe(true);
  });

  it('flags file inputs', () => {
    expect(hasComplexContent('<input type="file">')).toBe(true);
  });

  it('flags range, color, date inputs', () => {
    expect(hasComplexContent('<input type="range">')).toBe(true);
    expect(hasComplexContent('<input type="color">')).toBe(true);
    expect(hasComplexContent('<input type="date">')).toBe(true);
  });

  it('allows simple text + button content', () => {
    expect(hasComplexContent('<p>Roll damage?</p>')).toBe(false);
    expect(hasComplexContent('<form><input type="number" name="mod"></form>')).toBe(false);
    expect(hasComplexContent('<input type="checkbox" name="secret">')).toBe(false);
  });
});

describe('extractFormFields', () => {
  it('returns empty array when there are no inputs', () => {
    expect(extractFormFields(makeEmptyHtml())).toHaveLength(0);
  });

  it('extracts a number input with its label', () => {
    const html = makeRoot(
      [{ tagName: 'input', type: 'number', name: 'modifier', id: 'mod', value: '2' }],
      [{ for: 'mod', text: 'Modifier' }],
    );
    const fields = extractFormFields(html);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({
      name: 'modifier',
      type: 'number',
      label: 'Modifier',
      value: 2,
    });
  });

  it('extracts a checkbox with default unchecked', () => {
    const html = makeRoot([{ tagName: 'input', type: 'checkbox', name: 'secret', checked: false }]);
    const fields = extractFormFields(html);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ name: 'secret', type: 'checkbox', value: false });
  });

  it('extracts a checked checkbox', () => {
    const html = makeRoot([{ tagName: 'input', type: 'checkbox', name: 'secret', checked: true }]);
    const fields = extractFormFields(html);
    expect(fields[0]).toMatchObject({ value: true });
  });

  it('extracts a select with options and current value', () => {
    const html = makeRoot([
      {
        tagName: 'select',
        name: 'rollMode',
        options: [
          { value: 'publicroll', text: 'Public' },
          { value: 'gmroll', text: 'GM Roll', selected: true },
        ],
      },
    ]);
    const fields = extractFormFields(html);
    expect(fields).toHaveLength(1);
    const f = fields[0];
    expect(f?.type).toBe('select');
    expect(f?.value).toBe('gmroll');
    expect(f?.options).toEqual([
      { value: 'publicroll', label: 'Public' },
      { value: 'gmroll', label: 'GM Roll' },
    ]);
  });

  it('extracts a text input', () => {
    const html = makeRoot([{ tagName: 'input', type: 'text', name: 'note', value: 'hello' }]);
    const fields = extractFormFields(html);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ type: 'text', name: 'note', value: 'hello' });
  });

  it('falls back to field name as label when no label element exists', () => {
    const html = makeRoot([{ tagName: 'input', type: 'text', name: 'myfield', value: '' }]);
    const fields = extractFormFields(html);
    expect(fields[0]?.label).toBe('myfield');
  });
});

describe('applyFormData', () => {
  it('sets a number input value', () => {
    const fakeInput = { tagName: 'input', type: 'number', name: 'modifier', value: '0', checked: false };
    const html = makeRoot([fakeInput as InputDescriptor]);
    applyFormData(html, { modifier: 3 });
    expect((html.find('[name="modifier"]').get(0) as unknown as { value: string })?.value).toBe('3');
  });

  it('sets checkbox checked state', () => {
    const fakeInput = { tagName: 'input', type: 'checkbox', name: 'secret', value: '', checked: false };
    const html = makeRoot([fakeInput as InputDescriptor]);
    applyFormData(html, { secret: true });
    expect((html.find('[name="secret"]').get(0) as unknown as { checked: boolean })?.checked).toBe(true);
  });

  it('is a no-op for empty formData', () => {
    expect(() => applyFormData(makeEmptyHtml(), {})).not.toThrow();
  });

  it('is a no-op when field name is not found in html', () => {
    const html = makeRoot([{ tagName: 'input', type: 'text', name: 'other', value: '' }]);
    expect(() => applyFormData(html, { missing: 'value' })).not.toThrow();
  });
});

describe('extractDialogSpec', () => {
  it('extracts title, text, and buttons', () => {
    const app = makeAppWithButtons(
      'Roll Damage',
      { yes: { label: '<b>Yes</b>' }, no: { label: 'No' } },
      'yes',
      '<p>Roll full damage?</p>',
    );
    const spec = extractDialogSpec('Dialog', app, makeEmptyHtml());
    expect(spec).not.toBeNull();
    expect(spec?.title).toBe('Roll Damage');
    expect(spec?.text).toBe('Roll full damage?');
    expect(spec?.buttons).toHaveLength(2);
    expect(spec?.buttons[0]).toEqual({ id: 'yes', label: 'Yes', isDefault: true });
    expect(spec?.buttons[1]).toEqual({ id: 'no', label: 'No', isDefault: false });
  });

  it('returns null when there are no buttons', () => {
    const app = makeAppWithButtons('Title', {});
    expect(extractDialogSpec('Dialog', app, makeEmptyHtml())).toBeNull();
  });

  it('returns null for complex content (script tags)', () => {
    const app = makeAppWithButtons('Script', { ok: { label: 'OK' } }, 'ok', '<script>bad()</script>');
    expect(extractDialogSpec('Dialog', app, makeEmptyHtml())).toBeNull();
  });

  it('returns null when app.data is undefined', () => {
    const app: FoundryDialogApp = { constructor: { name: 'Dialog' } };
    expect(extractDialogSpec('Dialog', app, makeEmptyHtml())).toBeNull();
  });

  it('sets text to null when content is empty', () => {
    const app = makeAppWithButtons('Empty', { ok: { label: 'OK' } }, 'ok', '');
    expect(extractDialogSpec('Dialog', app, makeEmptyHtml())?.text).toBeNull();
  });

  it('sets kind from the hook name argument', () => {
    const spec = extractDialogSpec('DialogV2', makeAppWithButtons(), makeEmptyHtml());
    expect(spec?.kind).toBe('DialogV2');
  });

  it('generates a unique dialogId each call', () => {
    const app = makeAppWithButtons();
    const a = extractDialogSpec('Dialog', app, makeEmptyHtml());
    const b = extractDialogSpec('Dialog', app, makeEmptyHtml());
    expect(a?.dialogId).not.toBe(b?.dialogId);
  });
});

describe('shouldSuppress', () => {
  it('returns false when suppress list is empty (default)', () => {
    const spec = { title: 'Anything', dialogId: 'x', kind: 'Dialog', text: null, buttons: [], fields: [] };
    expect(shouldSuppress(spec)).toBe(false);
  });
});

// ─── Integration flow ─────────────────────────────────────────────────────

describe('handleDialog', () => {
  it('skips when no clients are connected', async () => {
    const offline = makeClient(false);
    await handleDialog('Dialog', makeAppWithButtons(), makeEmptyHtml(), [offline.stub]);
    expect(offline.sendEvent).not.toHaveBeenCalled();
  });

  it('skips when spec cannot be extracted (no buttons)', async () => {
    const client = makeClient();
    await handleDialog('Dialog', makeAppWithButtons('T', {}), makeEmptyHtml(), [client.stub]);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });

  it('sends dialog-request and submits resolved button', async () => {
    const client = makeClient();
    const submitMock = jest.fn();
    const app = makeAppWithButtons('Roll Damage', {
      yes: { label: 'Yes', callback: jest.fn() },
      no: { label: 'No', callback: jest.fn() },
    }, 'yes');
    (app as { submit: jest.Mock }).submit = submitMock;

    void handleDialog('Dialog', app, makeEmptyHtml(), [client.stub]);
    await flushMicrotasks();

    expect(client.sendEvent).toHaveBeenCalledWith(
      'dialog-request',
      expect.objectContaining({
        title: 'Roll Damage',
        kind: 'Dialog',
        buttons: expect.arrayContaining([expect.objectContaining({ id: 'yes', isDefault: true })]),
      }),
    );

    client.resolve({ value: { buttonId: 'yes', formData: {} } });
    await flushMicrotasks();

    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Yes' }));
    expect(pendingDialogs.size).toBe(0);
  });

  it('closes the dialog when player dismisses (value null)', async () => {
    const client = makeClient();
    const closeMock = jest.fn().mockResolvedValue(undefined);
    const app = makeAppWithButtons();
    (app as { close: jest.Mock }).close = closeMock;

    void handleDialog('Dialog', app, makeEmptyHtml(), [client.stub]);
    await flushMicrotasks();

    client.resolve({ value: null });
    await flushMicrotasks();

    expect(closeMock).toHaveBeenCalled();
  });

  it('leaves native dialog open when all clients reject', async () => {
    const a = makeClient();
    const b = makeClient();
    const closeMock = jest.fn();
    const app = makeAppWithButtons();
    (app as { close: jest.Mock }).close = closeMock;

    void handleDialog('Dialog', app, makeEmptyHtml(), [a.stub, b.stub]);
    await flushMicrotasks();

    a.reject(new Error('gone'));
    b.reject(new Error('gone'));
    await flushMicrotasks();

    expect(closeMock).not.toHaveBeenCalled();
    expect(pendingDialogs.size).toBe(0);
  });

  it('takes the first-response from multiple clients', async () => {
    const slow = makeClient();
    const fast = makeClient();
    const submitMock = jest.fn();
    const app = makeAppWithButtons('D', { ok: { label: 'OK', callback: jest.fn() } }, 'ok');
    (app as { submit: jest.Mock }).submit = submitMock;

    void handleDialog('Dialog', app, makeEmptyHtml(), [slow.stub, fast.stub]);
    await flushMicrotasks();

    fast.resolve({ value: { buttonId: 'ok', formData: {} } });
    await flushMicrotasks();
    expect(submitMock).toHaveBeenCalledTimes(1);

    // Late slow response — should be ignored.
    slow.resolve({ value: { buttonId: 'ok', formData: {} } });
    await flushMicrotasks();
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('uses app.close() when app.submit is absent', async () => {
    const client = makeClient();
    const callbackMock = jest.fn();
    const closeMock = jest.fn().mockResolvedValue(undefined);
    const app: FoundryDialogApp = {
      constructor: { name: 'Dialog' },
      data: {
        title: 'Fallback',
        content: '',
        buttons: { ok: { label: 'OK', callback: callbackMock } },
        default: 'ok',
      },
      // No submit — tests the fallback path
      close: closeMock,
    };

    void handleDialog('Dialog', app, makeEmptyHtml(), [client.stub]);
    await flushMicrotasks();

    client.resolve({ value: { buttonId: 'ok', formData: {} } });
    await flushMicrotasks();

    expect(callbackMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
  });
});
