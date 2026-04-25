import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { PromptDialog } from './PromptDialog';
import type { PendingPrompt } from '../../lib/usePromptStream';
import type { DialogSpec } from '@foundry-toolkit/shared/rpc';

// ─── Mock api.resolvePrompt ────────────────────────────────────────────────

const resolvePromptMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock('../../api/client', () => ({
  api: {
    resolvePrompt: (...args: unknown[]) => resolvePromptMock(...args),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

beforeEach(() => {
  resolvePromptMock.mockClear();
  cleanup();
});

// ─── Test builders ────────────────────────────────────────────────────────

function makePromptRequest(overrides: Partial<{
  bridgeId: string;
  title: string;
  prompt: string;
  choices: Array<{ value: string; label: string; img: string | null; group: string | null }>;
  allowNoSelection: boolean;
}>= {}): PendingPrompt {
  return {
    bridgeId: overrides.bridgeId ?? 'test-bridge-id',
    type: 'prompt-request',
    createdAt: Date.now(),
    payload: {
      title: overrides.title ?? 'Choose Option',
      prompt: overrides.prompt ?? 'Pick one:',
      item: { name: null, img: null, uuid: null },
      allowNoSelection: overrides.allowNoSelection ?? false,
      choices: overrides.choices ?? [
        { value: 'fire', label: 'Fire', img: null, group: null },
        { value: 'cold', label: 'Cold', img: null, group: null },
      ],
    },
  };
}

function makeDialogRequest(spec: Partial<DialogSpec> = {}): PendingPrompt {
  const fullSpec: DialogSpec = {
    dialogId: spec.dialogId ?? 'dialog-id-1',
    kind: spec.kind ?? 'Dialog',
    title: spec.title ?? 'Confirm Action',
    // Use `in` so an explicit `null` isn't overwritten by the default.
    text: 'text' in spec ? (spec.text ?? null) : 'Do you want to proceed?',
    buttons: spec.buttons ?? [
      { id: 'yes', label: 'Yes', isDefault: true },
      { id: 'no', label: 'No', isDefault: false },
    ],
    fields: spec.fields ?? [],
  };
  return {
    bridgeId: 'test-dialog-bridge',
    type: 'dialog-request',
    createdAt: Date.now(),
    payload: fullSpec,
  };
}

// ─── ChoiceSet (prompt-request) tests ─────────────────────────────────────

describe('PromptDialog — prompt-request (ChoiceSet)', () => {
  it('renders dialog title and prompt text', () => {
    const { container } = render(
      <PromptDialog prompt={makePromptRequest({ title: 'Damage Type', prompt: 'Pick a type:' })} onResolved={() => undefined} />,
    );
    expect(container.querySelector('[data-testid="dialog-title"]')?.textContent).toBe('Damage Type');
    expect(container.textContent).toContain('Pick a type:');
  });

  it('renders one button per choice', () => {
    const { container } = render(
      <PromptDialog prompt={makePromptRequest()} onResolved={() => undefined} />,
    );
    const buttons = container.querySelectorAll('[data-testid="choice-button"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('data-choice-label')).toBe('Fire');
    expect(buttons[1]?.getAttribute('data-choice-label')).toBe('Cold');
  });

  it('calls resolvePrompt with the choice value on click', async () => {
    const onResolved = vi.fn();
    const { container } = render(
      <PromptDialog prompt={makePromptRequest()} onResolved={onResolved} />,
    );
    const fireBtn = Array.from(container.querySelectorAll('[data-testid="choice-button"]')).find(
      (b) => b.getAttribute('data-choice-label') === 'Fire',
    );
    expect(fireBtn).toBeTruthy();
    fireEvent.click(fireBtn!);
    await vi.waitFor(() => expect(resolvePromptMock).toHaveBeenCalledWith('test-bridge-id', 'fire'));
    expect(onResolved).toHaveBeenCalled();
  });

  it('shows grouped choices with group headers', () => {
    const prompt = makePromptRequest({
      choices: [
        { value: 'fire', label: 'Fire', img: null, group: 'Energy' },
        { value: 'cold', label: 'Cold', img: null, group: 'Energy' },
        { value: 'slashing', label: 'Slashing', img: null, group: 'Physical' },
      ],
    });
    const { container } = render(<PromptDialog prompt={prompt} onResolved={() => undefined} />);
    expect(container.textContent).toContain('Energy');
    expect(container.textContent).toContain('Physical');
  });

  it('shows a Skip button when allowNoSelection is true', () => {
    const prompt = makePromptRequest({ allowNoSelection: true });
    const { container } = render(<PromptDialog prompt={prompt} onResolved={() => undefined} />);
    expect(container.querySelector('[data-testid="dismiss-button"]')).toBeTruthy();
  });

  it('hides Skip button when allowNoSelection is false', () => {
    const prompt = makePromptRequest({ allowNoSelection: false });
    const { container } = render(<PromptDialog prompt={prompt} onResolved={() => undefined} />);
    expect(container.querySelector('[data-testid="dismiss-button"]')).toBeNull();
  });

  it('renders choice images when present', () => {
    const prompt = makePromptRequest({
      choices: [{ value: 'fire', label: 'Fire', img: '/icons/fire.png', group: null }],
    });
    const { container } = render(<PromptDialog prompt={prompt} onResolved={() => undefined} />);
    const img = container.querySelector('[data-testid="choice-button"] img');
    expect(img?.getAttribute('src')).toBe('/icons/fire.png');
  });
});

// ─── Generic dialog (dialog-request) tests ────────────────────────────────

describe('PromptDialog — dialog-request (Dialog/V2)', () => {
  it('renders dialog title and text', () => {
    const { container } = render(
      <PromptDialog prompt={makeDialogRequest({ title: 'Roll Damage', text: 'Roll now?' })} onResolved={() => undefined} />,
    );
    expect(container.querySelector('[data-testid="dialog-title"]')?.textContent).toBe('Roll Damage');
    expect(container.textContent).toContain('Roll now?');
  });

  it('renders one button per spec button', () => {
    const { container } = render(<PromptDialog prompt={makeDialogRequest()} onResolved={() => undefined} />);
    const buttons = container.querySelectorAll('[data-testid="dialog-button"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('data-button-id')).toBe('yes');
    expect(buttons[1]?.getAttribute('data-button-id')).toBe('no');
  });

  it('marks the default button', () => {
    const { container } = render(<PromptDialog prompt={makeDialogRequest()} onResolved={() => undefined} />);
    const buttons = container.querySelectorAll('[data-testid="dialog-button"]');
    expect(buttons[0]?.getAttribute('data-is-default')).toBe('true');
    expect(buttons[1]?.getAttribute('data-is-default')).toBe('false');
  });

  it('calls resolvePrompt with buttonId and empty formData on button click', async () => {
    const onResolved = vi.fn();
    const { container } = render(<PromptDialog prompt={makeDialogRequest()} onResolved={onResolved} />);
    const yesBtn = container.querySelector('[data-button-id="yes"]');
    fireEvent.click(yesBtn!);
    await vi.waitFor(() =>
      expect(resolvePromptMock).toHaveBeenCalledWith('test-dialog-bridge', {
        buttonId: 'yes',
        formData: {},
      }),
    );
    expect(onResolved).toHaveBeenCalled();
  });

  it('renders a checkbox field and includes its value in the resolution', async () => {
    const spec: Partial<DialogSpec> = {
      buttons: [{ id: 'roll', label: 'Roll', isDefault: true }],
      fields: [{ name: 'secret', type: 'checkbox', label: 'Secret Roll', value: false }],
    };
    const { container } = render(<PromptDialog prompt={makeDialogRequest(spec)} onResolved={() => undefined} />);

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    // Tick the checkbox.
    fireEvent.click(checkbox);

    const rollBtn = container.querySelector('[data-button-id="roll"]');
    fireEvent.click(rollBtn!);

    await vi.waitFor(() =>
      expect(resolvePromptMock).toHaveBeenCalledWith('test-dialog-bridge', {
        buttonId: 'roll',
        formData: { secret: true },
      }),
    );
  });

  it('renders a select field with options and sends selected value', async () => {
    const spec: Partial<DialogSpec> = {
      buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
      fields: [
        {
          name: 'rollMode',
          type: 'select',
          label: 'Roll Mode',
          value: 'publicroll',
          options: [
            { value: 'publicroll', label: 'Public' },
            { value: 'gmroll', label: 'GM Roll' },
          ],
        },
      ],
    };
    const { container } = render(<PromptDialog prompt={makeDialogRequest(spec)} onResolved={() => undefined} />);

    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'gmroll' } });

    const okBtn = container.querySelector('[data-button-id="ok"]');
    fireEvent.click(okBtn!);

    await vi.waitFor(() =>
      expect(resolvePromptMock).toHaveBeenCalledWith('test-dialog-bridge', {
        buttonId: 'ok',
        formData: { rollMode: 'gmroll' },
      }),
    );
  });

  it('renders a number field', () => {
    const spec: Partial<DialogSpec> = {
      buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
      fields: [{ name: 'modifier', type: 'number', label: 'Modifier', value: 0 }],
    };
    const { container } = render(<PromptDialog prompt={makeDialogRequest(spec)} onResolved={() => undefined} />);
    expect(container.querySelector('[data-testid="dialog-field"]')).toBeTruthy();
    expect(container.querySelector('input[type="number"]')).toBeTruthy();
  });

  it('omits text section when spec.text is null', () => {
    const { container } = render(
      <PromptDialog prompt={makeDialogRequest({ text: null })} onResolved={() => undefined} />,
    );
    // Should still have a title but no paragraph below it.
    const panel = container.querySelector('[data-testid="prompt-dialog-panel"]');
    expect(panel?.querySelectorAll('p')).toHaveLength(0);
  });

  it('shows an overlay backdrop', () => {
    const { container } = render(<PromptDialog prompt={makeDialogRequest()} onResolved={() => undefined} />);
    expect(container.querySelector('[data-testid="prompt-dialog-overlay"]')).toBeTruthy();
  });

  it('handles a single-button dialog (confirm-style)', () => {
    const spec: Partial<DialogSpec> = {
      title: 'Done',
      buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
    };
    const { container } = render(<PromptDialog prompt={makeDialogRequest(spec)} onResolved={() => undefined} />);
    const buttons = container.querySelectorAll('[data-testid="dialog-button"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('OK');
  });
});

// ─── Unknown event kind ────────────────────────────────────────────────────

describe('PromptDialog — unknown type', () => {
  it('renders a fallback dismiss for unknown types', () => {
    const prompt: PendingPrompt = {
      bridgeId: 'unknown-bridge',
      type: 'future-unknown-type' as never,
      createdAt: Date.now(),
      payload: {},
    };
    const { container } = render(<PromptDialog prompt={prompt} onResolved={() => undefined} />);
    expect(container.querySelector('[data-testid="prompt-dialog-overlay"]')).toBeTruthy();
    expect(container.textContent).toContain('future-unknown-type');
  });
});

// ─── Dismiss / Skip ────────────────────────────────────────────────────────

describe('PromptDialog — dismiss', () => {
  it('calls resolvePrompt with null when Skip is clicked', async () => {
    const onResolved = vi.fn();
    const { container } = render(
      <PromptDialog
        prompt={makePromptRequest({ allowNoSelection: true })}
        onResolved={onResolved}
      />,
    );
    const skipBtn = container.querySelector('[data-testid="dismiss-button"]');
    fireEvent.click(skipBtn!);
    await vi.waitFor(() => expect(resolvePromptMock).toHaveBeenCalledWith('test-bridge-id', null));
    expect(onResolved).toHaveBeenCalled();
  });
});
