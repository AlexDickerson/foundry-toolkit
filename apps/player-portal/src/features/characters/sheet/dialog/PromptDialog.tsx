// Spec-driven modal that renders a pending bridge prompt to the player.
//
// Handles two bridge event kinds:
//   • `prompt-request` (ChoiceSet / PickAThingPrompt) — shows a list of
//     labelled choice cards with optional item images.
//   • `dialog-request` (generic Foundry Dialog / DialogV2) — shows a
//     title + text block + button row, with optional form fields.
//
// The component is intentionally generic: it does not know about specific
// pf2e or Foundry classes, only the spec shapes defined in
// @foundry-toolkit/shared/rpc.

import { useState } from 'react';
import type { DialogSpec, DialogField, DialogResolution } from '@foundry-toolkit/shared/rpc';
import type { PendingPrompt } from '@/features/characters/sheet/hooks/usePromptStream';
import { api } from '@/features/characters/api';
import { BRIDGE_EVENT_DIALOG_REQUEST, BRIDGE_EVENT_PROMPT_REQUEST } from '@foundry-toolkit/shared/rpc';

// ─── ChoiceSet prompt payload ─────────────────────────────────────────────
// Mirrors PromptRequestPayload from foundry-api-bridge/src/creator/prompt-intercept.ts.

interface PromptChoice {
  value: unknown;
  label: string;
  img: string | null;
  group: string | null;
}

interface PromptRequestPayload {
  title: string;
  prompt: string;
  item: { name: string | null; img: string | null; uuid: string | null };
  allowNoSelection: boolean;
  choices: PromptChoice[];
}

// ─── Props ────────────────────────────────────────────────────────────────

interface PromptDialogProps {
  prompt: PendingPrompt;
  /** Called after the player submits or dismisses the prompt. */
  onResolved: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export function PromptDialog({ prompt, onResolved }: PromptDialogProps): React.ReactElement {
  if (prompt.type === BRIDGE_EVENT_PROMPT_REQUEST) {
    return (
      <ChoiceSetDialog
        bridgeId={prompt.bridgeId}
        payload={prompt.payload as PromptRequestPayload}
        onResolved={onResolved}
      />
    );
  }

  if (prompt.type === BRIDGE_EVENT_DIALOG_REQUEST) {
    return (
      <GenericDialog
        bridgeId={prompt.bridgeId}
        spec={prompt.payload as DialogSpec}
        onResolved={onResolved}
      />
    );
  }

  // Future / unknown event kind — offer a plain dismiss.
  const unknownType: string = prompt.type;
  return (
    <DialogShell title="Action Required">
      <p className="text-sm text-neutral-700">
        Foundry is waiting for your input (type: <code>{unknownType}</code>).
      </p>
      <DismissButton bridgeId={prompt.bridgeId} onResolved={onResolved} />
    </DialogShell>
  );
}

// ─── ChoiceSet dialog ─────────────────────────────────────────────────────

interface ChoiceSetProps {
  bridgeId: string;
  payload: PromptRequestPayload;
  onResolved: () => void;
}

function ChoiceSetDialog({ bridgeId, payload, onResolved }: ChoiceSetProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (value: unknown): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.resolvePrompt(bridgeId, value);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send choice');
      setBusy(false);
    }
  };

  // Group choices if any have a group label.
  const grouped = groupChoices(payload.choices);

  return (
    <DialogShell title={payload.title}>
      {payload.item.name != null && (
        <div className="mb-3 flex items-center gap-2">
          {payload.item.img != null && (
            <img src={payload.item.img} alt={payload.item.name} className="h-8 w-8 rounded object-cover" />
          )}
          <span className="text-sm font-medium text-neutral-800">{payload.item.name}</span>
        </div>
      )}
      {payload.prompt.length > 0 && (
        <p className="mb-3 text-sm text-neutral-700">{payload.prompt}</p>
      )}

      {error != null && (
        <p className="mb-2 text-xs text-red-600">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {grouped.map(({ group, choices }) => (
          <div key={group ?? '__ungrouped'}>
            {group != null && (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={(): void => { void pick(choice.value); }}
                  className="flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                  data-testid="choice-button"
                  data-choice-label={choice.label}
                >
                  {choice.img != null && (
                    <img src={choice.img} alt="" className="h-5 w-5 rounded object-cover" />
                  )}
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {payload.allowNoSelection && (
        <DismissButton bridgeId={bridgeId} onResolved={onResolved} className="mt-3" />
      )}
    </DialogShell>
  );
}

// ─── Generic dialog ───────────────────────────────────────────────────────

interface GenericDialogProps {
  bridgeId: string;
  spec: DialogSpec;
  onResolved: () => void;
}

function GenericDialog({ bridgeId, spec, onResolved }: GenericDialogProps): React.ReactElement {
  // Build initial form state from spec defaults.
  const [formData, setFormData] = useState<Record<string, string | number | boolean>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.name, f.value])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleButton = async (buttonId: string): Promise<void> => {
    setBusy(true);
    setError(null);
    const resolution: DialogResolution = { buttonId, formData };
    try {
      await api.resolvePrompt(bridgeId, resolution);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send response');
      setBusy(false);
    }
  };

  const updateField = (name: string, value: string | number | boolean): void => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <DialogShell title={spec.title}>
      {spec.text != null && <p className="mb-3 text-sm text-neutral-700">{spec.text}</p>}

      {spec.fields.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {spec.fields.map((field) => (
            <FieldRow key={field.name} field={field} value={formData[field.name] ?? field.value} onChange={updateField} />
          ))}
        </div>
      )}

      {error != null && (
        <p className="mb-2 text-xs text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        {spec.buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            disabled={busy}
            onClick={(): void => { void handleButton(btn.id); }}
            className={[
              'rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50',
              btn.isDefault
                ? 'bg-amber-700 text-white hover:bg-amber-800'
                : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
            data-testid="dialog-button"
            data-button-id={btn.id}
            data-is-default={String(btn.isDefault)}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </DialogShell>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: DialogField;
  value: string | number | boolean;
  onChange: (name: string, value: string | number | boolean) => void;
}

function FieldRow({ field, value, onChange }: FieldRowProps): React.ReactElement {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-neutral-700" data-testid="dialog-field">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e): void => { onChange(field.name, e.target.checked); }}
          className="h-4 w-4 rounded border-neutral-300"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === 'select' && field.options != null) {
    return (
      <label className="flex flex-col gap-1 text-sm text-neutral-700" data-testid="dialog-field">
        {field.label}
        <select
          value={String(value)}
          onChange={(e): void => { onChange(field.name, e.target.value); }}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'number') {
    return (
      <label className="flex flex-col gap-1 text-sm text-neutral-700" data-testid="dialog-field">
        {field.label}
        <input
          type="number"
          value={Number(value)}
          onChange={(e): void => { onChange(field.name, Number(e.target.value)); }}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
        />
      </label>
    );
  }

  // text / textarea
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-700" data-testid="dialog-field">
      {field.label}
      <input
        type="text"
        value={String(value)}
        onChange={(e): void => { onChange(field.name, e.target.value); }}
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
      />
    </label>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────

interface ShellProps {
  title: string;
  children: React.ReactNode;
}

function DialogShell({ title, children }: ShellProps): React.ReactElement {
  return (
    // Fixed overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="prompt-dialog-overlay"
    >
      <div
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl"
        data-testid="prompt-dialog-panel"
      >
        <h2 className="mb-3 text-base font-semibold text-neutral-900" data-testid="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

interface DismissButtonProps {
  bridgeId: string;
  onResolved: () => void;
  className?: string;
}

function DismissButton({ bridgeId, onResolved, className }: DismissButtonProps): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const dismiss = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.resolvePrompt(bridgeId, null);
      onResolved();
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={(): void => { void dismiss(); }}
      className={[
        'text-xs text-neutral-500 underline hover:text-neutral-700 disabled:opacity-50',
        className,
      ].filter(Boolean).join(' ')}
      data-testid="dismiss-button"
    >
      Skip
    </button>
  );
}

// ─── Choice grouping helper ───────────────────────────────────────────────

interface ChoiceGroup {
  group: string | null;
  choices: PromptChoice[];
}

function groupChoices(choices: PromptChoice[]): ChoiceGroup[] {
  const groups: ChoiceGroup[] = [];
  const seen = new Map<string | null, ChoiceGroup>();

  for (const c of choices) {
    const key = c.group ?? null;
    let g = seen.get(key);
    if (!g) {
      g = { group: key, choices: [] };
      groups.push(g);
      seen.set(key, g);
    }
    g.choices.push(c);
  }

  return groups;
}
