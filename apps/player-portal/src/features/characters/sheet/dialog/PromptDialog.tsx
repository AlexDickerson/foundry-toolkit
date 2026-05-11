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

import { useMemo, useState } from 'react';
import type { DialogSpec, DialogField, DialogResolution } from '@foundry-toolkit/shared/rpc';
import type { PendingPrompt } from '@/features/characters/sheet/hooks/usePromptStream';
import type { CompendiumMatch } from '@/features/characters/types';
import { api } from '@/features/characters/api';
import { BRIDGE_EVENT_DIALOG_REQUEST, BRIDGE_EVENT_PROMPT_REQUEST } from '@foundry-toolkit/shared/rpc';
import { CompendiumDetailPanel } from '@/features/characters/internal/CompendiumDetailPanel';
import { PickerDialog } from '@/shared/ui/PickerDialog';

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
    return <GenericDialog bridgeId={prompt.bridgeId} spec={prompt.payload as DialogSpec} onResolved={onResolved} />;
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

// Dispatcher: when every choice carries a Compendium UUID value, route
// through the rich detail panel (description, traits, rarity,
// mechanical block, etc. — same view as the regular ancestry/class
// picker). Otherwise fall back to the simple button grid; some pf2e
// ChoiceSets use scalar string/number values (e.g. "1 / 2 / 3 actions"
// picks) that have no compendium document to render.
function ChoiceSetDialog({ bridgeId, payload, onResolved }: ChoiceSetProps): React.ReactElement {
  const allUuid = payload.choices.length > 0 && payload.choices.every((c) => isCompendiumUuid(c.value));
  return allUuid ? (
    <PromptDetailDialog bridgeId={bridgeId} payload={payload} onResolved={onResolved} />
  ) : (
    <ChoiceSetButtonGrid bridgeId={bridgeId} payload={payload} onResolved={onResolved} />
  );
}

function ChoiceSetButtonGrid({ bridgeId, payload, onResolved }: ChoiceSetProps): React.ReactElement {
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
      {payload.prompt.length > 0 && <p className="mb-3 text-sm text-neutral-700">{payload.prompt}</p>}

      {error != null && <p className="mb-2 text-xs text-red-600">{error}</p>}

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
                  onClick={(): void => {
                    void pick(choice.value);
                  }}
                  className="flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                  data-testid="choice-button"
                  data-choice-label={choice.label}
                >
                  {choice.img != null && <img src={choice.img} alt="" className="h-5 w-5 rounded object-cover" />}
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {payload.allowNoSelection && <DismissButton bridgeId={bridgeId} onResolved={onResolved} className="mt-3" />}
    </DialogShell>
  );
}

// ─── ChoiceSet detail dialog ──────────────────────────────────────────────
// Used for pf2e ChoiceSets whose choices are Compendium UUIDs —
// heritage picks, subclass picks (Druid Order, Cleric Doctrine, Sorcerer
// Bloodline, etc.). Renders a two-column picker dialog: the choice list
// on the left, the full CompendiumDetailPanel on the right.

function PromptDetailDialog({ bridgeId, payload, onResolved }: ChoiceSetProps): React.ReactElement {
  const [target, setTarget] = useState<CompendiumMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert each prompt choice to a CompendiumMatch shape the detail
  // panel can consume. UUID parse + pack-name → doc-type inference give
  // the panel the type it needs to route to the right mechanics block
  // (ancestry / heritage / class / etc.) before the doc fetch lands.
  const groupedChoices = useMemo(() => {
    const enriched: { match: CompendiumMatch; group: string | null }[] = [];
    for (const c of payload.choices) {
      if (typeof c.value !== 'string') continue;
      const parsed = parseCompendiumUuid(c.value);
      if (parsed === null) continue;
      enriched.push({
        match: {
          uuid: c.value,
          name: c.label,
          img: c.img ?? '',
          packId: parsed.packId,
          packLabel: '',
          documentId: parsed.documentId,
          type: inferDocType(parsed.packId),
        },
        group: c.group,
      });
    }
    // Preserve insertion order; just bucket by group label.
    const groups: { group: string | null; items: { match: CompendiumMatch }[] }[] = [];
    const byKey = new Map<string | null, (typeof groups)[number]>();
    for (const item of enriched) {
      const key = item.group ?? null;
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = { group: key, items: [] };
        groups.push(bucket);
        byKey.set(key, bucket);
      }
      bucket.items.push({ match: item.match });
    }
    return groups;
  }, [payload.choices]);

  const commit = async (uuid: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.resolvePrompt(bridgeId, uuid);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send choice');
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.resolvePrompt(bridgeId, null);
      onResolved();
    } catch {
      setBusy(false);
    }
  };

  const detailOpen = target !== null;

  return (
    <PickerDialog
      title={payload.title}
      onClose={(): void => {
        if (!busy) void cancel();
      }}
      maxWidthClass={detailOpen ? 'max-w-6xl' : 'max-w-md'}
      animateMaxWidth
      testId="prompt-detail-dialog"
    >
      {payload.prompt.length > 0 && (
        <p className="border-b border-pf-border px-4 py-2 text-xs text-pf-alt">{payload.prompt}</p>
      )}
      {error !== null && <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex min-h-0 flex-1">
        <ul
          className={[
            'divide-y divide-pf-border overflow-y-auto',
            detailOpen ? 'w-72 shrink-0 border-r border-pf-border' : 'flex-1',
          ].join(' ')}
          data-testid="prompt-detail-list"
        >
          {groupedChoices.flatMap(({ group, items }) => {
            const rows: React.ReactNode[] = [];
            if (group !== null) {
              rows.push(
                <li
                  key={`group-${group}`}
                  className="border-b border-pf-border bg-pf-bg-dark px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark"
                >
                  {group}
                </li>,
              );
            }
            for (const { match } of items) {
              const active = target?.uuid === match.uuid;
              rows.push(
                <li key={match.uuid}>
                  <button
                    type="button"
                    onClick={(): void => {
                      setTarget(match);
                    }}
                    disabled={busy}
                    aria-pressed={active}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                      active ? 'bg-pf-tertiary/50' : 'hover:bg-pf-tertiary/20',
                      busy ? 'opacity-60' : '',
                    ].join(' ')}
                    data-testid="choice-button"
                    data-choice-label={match.name}
                  >
                    {match.img !== '' && (
                      <img
                        src={match.img}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded border border-pf-border bg-pf-bg-dark"
                      />
                    )}
                    <span className="truncate text-sm font-medium text-pf-text">{match.name}</span>
                  </button>
                </li>,
              );
            }
            return rows;
          })}
        </ul>
        {detailOpen && target !== null && (
          <CompendiumDetailPanel
            target={target}
            onPick={(): void => {
              void commit(target.uuid);
            }}
            onClose={(): void => {
              setTarget(null);
            }}
          />
        )}
      </div>
      {payload.allowNoSelection && (
        <div className="flex items-center justify-end border-t border-pf-border px-4 py-2">
          <button
            type="button"
            onClick={(): void => {
              if (!busy) void cancel();
            }}
            disabled={busy}
            data-testid="dismiss-button"
            className="text-xs text-pf-alt-dark underline hover:text-pf-primary disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      )}
    </PickerDialog>
  );
}

// Compendium UUID guard. The bridge sends choice values as `unknown`;
// only strings of the shape `Compendium.{module}.{pack}.{Type}.{id}` go
// through the rich detail panel.
function isCompendiumUuid(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('Compendium.') && value.split('.').length === 5;
}

function parseCompendiumUuid(uuid: string): { packId: string; type: string; documentId: string } | null {
  const parts = uuid.split('.');
  if (parts.length !== 5 || parts[0] !== 'Compendium') return null;
  const [, mod, pack, type, id] = parts;
  if (!mod || !pack || !type || !id) return null;
  return { packId: `${mod}.${pack}`, type, documentId: id };
}

// PF2e pack → document subtype mapping. The CompendiumDetailPanel
// routes its mechanics blocks off `target.type`; without inference,
// every UUID-fed choice would render as a plain "Item" with no special
// treatment. The actual `doc.type` is correct after the panel's fetch
// lands, but the inference gives the panel a sensible default during
// the loading state too.
function inferDocType(packId: string): string {
  if (packId === 'pf2e.heritages') return 'heritage';
  if (packId === 'pf2e.ancestries') return 'ancestry';
  if (packId === 'pf2e.classes') return 'class';
  if (packId === 'pf2e.backgrounds') return 'background';
  if (packId === 'pf2e.deities') return 'deity';
  if (packId === 'pf2e.classfeatures') return 'feature';
  if (packId.includes('feats')) return 'feat';
  return 'Item';
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
            <FieldRow
              key={field.name}
              field={field}
              value={formData[field.name] ?? field.value}
              onChange={updateField}
            />
          ))}
        </div>
      )}

      {error != null && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {spec.buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            disabled={busy}
            onClick={(): void => {
              void handleButton(btn.id);
            }}
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
          onChange={(e): void => {
            onChange(field.name, e.target.checked);
          }}
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
          onChange={(e): void => {
            onChange(field.name, e.target.value);
          }}
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
          onChange={(e): void => {
            onChange(field.name, Number(e.target.value));
          }}
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
        onChange={(e): void => {
          onChange(field.name, e.target.value);
        }}
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
      onClick={(): void => {
        void dismiss();
      }}
      className={['text-xs text-neutral-500 underline hover:text-neutral-700 disabled:opacity-50', className]
        .filter(Boolean)
        .join(' ')}
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
