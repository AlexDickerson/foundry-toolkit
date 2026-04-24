import { useEffect, useRef, useState } from 'react';
import { api, ApiRequestError } from '../../api/client';
import type { CompendiumDocument } from '../../api/types';
import { enrichDescription } from '../../lib/foundry-enrichers';
import type { PendingPrompt } from '../../lib/usePendingPrompts';
import { useUuidHover } from '../../lib/useUuidHover';

// Renders a pf2e ChoiceSet prompt as a two-pane picker: choices on
// the left, detail pane on the right (compendium docs fetched lazily
// for UUID-valued choices), and a Confirm button that POSTs the
// selected value back to the server. The server relays it over the
// WebSocket bridge, pf2e's ChoiceSetRuleElement.preCreate sees the
// selection, and adds the item.
//
// Non-UUID choices (skill slugs, key strings, numbers) skip the
// compendium fetch and show a placeholder in the detail pane.

interface Props {
  prompt: PendingPrompt;
}

type DetailState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; uuid: string; doc: CompendiumDocument }
  | { kind: 'error'; uuid: string; message: string };

export function PromptModal({ prompt }: Props): React.ReactElement {
  const { payload } = prompt;
  const [resolving, setResolving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(payload.choices.length > 0 ? 0 : null);
  const [detail, setDetail] = useState<DetailState>({ kind: 'idle' });
  // Cache docs across selection changes so toggling back is instant
  // and avoids duplicate round-trips.
  const docCache = useRef<Map<string, CompendiumDocument>>(new Map());
  // Hover popovers inside the description panel (same treatment as
  // the rest of the app when enriched HTML contains `@UUID[...]`).
  const uuidHover = useUuidHover();

  // Lock background scrolling while the modal is live.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Fetch the full document whenever a UUID-valued choice is selected.
  // Non-UUID selections idle the detail panel.
  const selectedChoice = selectedIndex !== null ? (payload.choices[selectedIndex] ?? null) : null;
  const selectedUuid = selectedChoice !== null ? extractUuid(selectedChoice.value) : null;
  useEffect(() => {
    if (selectedUuid === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail({ kind: 'idle' });
      return;
    }
    const cached = docCache.current.get(selectedUuid);
    if (cached !== undefined) {
      setDetail({ kind: 'ready', uuid: selectedUuid, doc: cached });
      return;
    }

    setDetail({ kind: 'loading', uuid: selectedUuid });
    let cancelled = false;
    void api
      .getCompendiumDocument(selectedUuid)
      .then((res) => {
        if (cancelled) return;
        docCache.current.set(selectedUuid, res.document);
        setDetail({ kind: 'ready', uuid: selectedUuid, doc: res.document });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
        setDetail({ kind: 'error', uuid: selectedUuid, message });
      });
    return (): void => {
      cancelled = true;
    };
  }, [selectedUuid]);

  const resolve = async (value: unknown): Promise<void> => {
    if (resolving) return;
    setResolving(true);
    try {
      await api.resolvePrompt(prompt.bridgeId, value);
    } catch (err) {
      console.warn('Failed to resolve prompt', err);
      setResolving(false);
    }
    // Leave `resolving` true on success — SSE removes the prompt
    // from the queue and the parent unmounts us.
  };

  const grouped = groupChoicesWithIndices(payload.choices);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={payload.title}
      data-testid="prompt-modal"
      onMouseOver={uuidHover.delegationHandlers.onMouseOver}
      onMouseOut={uuidHover.delegationHandlers.onMouseOut}
    >
      <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded border border-pf-border bg-pf-bg shadow-2xl">
        <header className="flex items-start gap-3 border-b border-pf-border bg-pf-bg-dark/60 px-4 py-3">
          {payload.item.img !== null && (
            <img
              src={payload.item.img}
              alt=""
              className="h-10 w-10 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-base font-semibold text-pf-text">{payload.title}</h2>
            {payload.item.name !== null && (
              <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">{payload.item.name}</p>
            )}
            <p className="mt-1 text-xs text-pf-text">{payload.prompt}</p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Choice list */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-pf-border">
            {grouped.map(([groupLabel, entries], gi) => (
              <div key={gi.toString()} className={gi > 0 ? 'mt-2' : ''}>
                {groupLabel !== null && (
                  <h3 className="border-b border-pf-border bg-pf-bg-dark/40 px-3 py-1 font-serif text-[11px] font-semibold uppercase tracking-widest text-pf-alt-dark">
                    {groupLabel}
                  </h3>
                )}
                <ul className="divide-y divide-pf-border">
                  {entries.map(([c, index]) => {
                    const isActive = index === selectedIndex;
                    return (
                      <li key={index.toString()}>
                        <button
                          type="button"
                          disabled={resolving}
                          onClick={(): void => {
                            setSelectedIndex(index);
                          }}
                          className={[
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-50',
                            isActive ? 'bg-pf-primary/10 text-pf-primary' : 'text-pf-text hover:bg-pf-bg-dark/40',
                          ].join(' ')}
                        >
                          {c.img !== null && (
                            <img
                              src={c.img}
                              alt=""
                              className="h-8 w-8 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Detail pane */}
          <div className="flex-1 overflow-y-auto p-4">
            <DetailPane choice={selectedChoice} uuid={selectedUuid} state={detail} />
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-pf-border bg-pf-bg-dark/60 px-4 py-2">
          <div className="text-xs text-pf-alt-dark">
            {selectedChoice !== null ? (
              <>
                Selected: <span className="font-semibold text-pf-text">{selectedChoice.label}</span>
              </>
            ) : (
              <span className="italic">No selection</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {payload.allowNoSelection && (
              <button
                type="button"
                disabled={resolving}
                onClick={(): void => {
                  void resolve(null);
                }}
                className="rounded border border-pf-border bg-white px-3 py-1.5 text-xs text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              disabled={resolving || selectedChoice === null}
              onClick={(): void => {
                if (selectedChoice !== null) void resolve(selectedChoice.value);
              }}
              className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </footer>
      </div>
      {uuidHover.popover}
    </div>
  );
}

function DetailPane({
  choice,
  uuid,
  state,
}: {
  choice: PendingPrompt['payload']['choices'][number] | null;
  uuid: string | null;
  state: DetailState;
}): React.ReactElement {
  if (choice === null) {
    return <p className="text-sm italic text-pf-alt">Pick a choice on the left.</p>;
  }
  if (uuid === null) {
    // Non-UUID values: just show the label; no compendium doc to fetch.
    return (
      <div>
        <h3 className="font-serif text-base font-semibold text-pf-text">{choice.label}</h3>
        <p className="mt-2 text-xs italic text-pf-alt">No additional detail for this choice.</p>
      </div>
    );
  }
  if (state.kind === 'idle' || (state.kind === 'loading' && state.uuid !== uuid)) {
    return <p className="text-sm italic text-pf-alt">Loading…</p>;
  }
  if (state.kind === 'loading') {
    return <p className="text-sm italic text-pf-alt">Loading…</p>;
  }
  if (state.kind === 'error') {
    return <p className="text-sm text-pf-primary">Couldn&apos;t load: {state.message}</p>;
  }
  return <DocDetail doc={state.doc} />;
}

function DocDetail({ doc }: { doc: CompendiumDocument }): React.ReactElement {
  const sys = doc.system as {
    description?: { value?: unknown };
    level?: { value?: unknown } | number;
    traits?: { value?: unknown };
  };
  const description = typeof sys.description?.value === 'string' ? sys.description.value : '';
  const level =
    typeof sys.level === 'number' ? sys.level : typeof sys.level?.value === 'number' ? sys.level.value : undefined;
  const traitsRaw = sys.traits?.value;
  const traits = Array.isArray(traitsRaw) ? traitsRaw.filter((v): v is string => typeof v === 'string') : [];
  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        {doc.img && (
          <img src={doc.img} alt="" className="h-12 w-12 flex-shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-semibold text-pf-text">{doc.name}</h3>
          <p className="text-[10px] uppercase tracking-widest text-pf-alt-dark">
            {doc.type}
            {level !== undefined && ` · Level ${level.toString()}`}
          </p>
          {traits.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {traits.slice(0, 12).map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-pf-tertiary-dark bg-pf-tertiary/40 px-1.5 py-0.5 text-[10px] text-pf-alt-dark"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {description.length > 0 ? (
        <div
          className="text-sm leading-relaxed [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-damage-heightened]:text-pf-prof-master [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2"
          dangerouslySetInnerHTML={{ __html: enrichDescription(description) }}
        />
      ) : (
        <p className="text-xs italic text-pf-alt">No description.</p>
      )}
    </div>
  );
}

// ChoiceSet values are frequently compendium UUIDs for the picked
// item (Research Field, Bloodline, Hunter's Edge …). Anything else
// — skill slugs, class-DC keys, raw numbers — we leave detail-less.
function extractUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.startsWith('Compendium.') ? value : null;
}

function groupChoicesWithIndices(
  choices: PendingPrompt['payload']['choices'],
): Array<[string | null, Array<[PendingPrompt['payload']['choices'][number], number]>]> {
  const map = new Map<string | null, Array<[PendingPrompt['payload']['choices'][number], number]>>();
  choices.forEach((c, idx) => {
    const key = c.group;
    const arr = map.get(key) ?? [];
    arr.push([c, idx]);
    map.set(key, arr);
  });
  return Array.from(map.entries());
}
