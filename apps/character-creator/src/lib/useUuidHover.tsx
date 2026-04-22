import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiRequestError } from '../api/client';
import type { CompendiumDocument } from '../api/types';
import { enrichDescription } from './foundry-enrichers';

// Hover previews for `@UUID[...]` enricher links inside a rendered
// description. The caller keeps their own `dangerouslySetInnerHTML`
// container; this hook returns mouse-over / mouse-out delegation
// handlers to spread onto it, plus a stack of portaled popovers.
//
// Nested hovers: hovering a `@UUID` anchor *inside* an already-open
// popover opens a new popover to the right of the parent, aligned at
// the parent's top edge. Any number of levels stack this way; moving
// the cursor back into a parent trims the deeper levels. Fetching is
// lazy and cached per hook instance.

interface HoverLevel {
  uuid: string;
  // Link bounding rect at open time. Only the root level (index 0)
  // uses this — deeper levels chain off the previous popover's
  // computed position.
  anchorRect: DOMRect;
}

type DocState = { kind: 'loading' } | { kind: 'ready'; doc: CompendiumDocument } | { kind: 'error'; message: string };

const POPOVER_WIDTH = 420;
const POPOVER_GAP = 6;
const HOVER_CLOSE_DELAY_MS = 140;
const HOVER_OPEN_DELAY_MS = 300;

export function useUuidHover(): {
  delegationHandlers: {
    onMouseOver: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseOut: (e: React.MouseEvent<HTMLElement>) => void;
  };
  popover: React.ReactElement | null;
} {
  const [stack, setStack] = useState<HoverLevel[]>([]);
  const [docs, setDocs] = useState<Map<string, DocState>>(new Map());
  const cacheRef = useRef<Map<string, DocState>>(new Map());
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const popoverElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const latestHandlersRef = useRef<{
    over: (e: MouseEvent) => void;
    out: (e: MouseEvent) => void;
  }>({ over: () => {}, out: () => {} });

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current !== null) clearTimeout(openTimerRef.current);
    },
    [],
  );

  const cancelClose = (): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  // Trim the popover stack down to `targetLength` after the close
  // delay. Cursor bridging (e.g. moving from anchor → popover or
  // popover N → popover M) calls this to close deeper levels without
  // losing the visual parent the user is heading toward.
  const scheduleCloseToLength = (targetLength: number): void => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setStack((s) => (s.length > targetLength ? s.slice(0, targetLength) : s));
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  };
  const cancelOpen = (): void => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };

  const loadDoc = async (uuid: string): Promise<void> => {
    if (cacheRef.current.has(uuid)) return;
    cacheRef.current.set(uuid, { kind: 'loading' });
    setDocs(new Map(cacheRef.current));
    try {
      const result = await api.getCompendiumDocument(uuid);
      cacheRef.current.set(uuid, { kind: 'ready', doc: result.document });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
      cacheRef.current.set(uuid, { kind: 'error', message: msg });
    }
    setDocs(new Map(cacheRef.current));
  };

  const handleMouseOver = (target: Element | null, _related: Element | null): void => {
    // Any element carrying `data-uuid` triggers a hover preview —
    // enricher anchors use the attribute, and callers like the
    // ChoiceSet prompt modal set it directly on a span inside an
    // otherwise-interactive button.
    const link = target?.closest('[data-uuid]') as HTMLElement | null;
    if (!link || link.hasAttribute('data-uuid-popover')) return;
    const uuid = link.getAttribute('data-uuid');
    if (!uuid) return;
    cancelClose();
    // Figure out which level this link lives in. Links inside popover
    // N open level N+1; links in the main content open level 0.
    const ownerPop = link.closest<HTMLElement>('[data-uuid-popover]');
    const parentLevel = ownerPop !== null ? Number(ownerPop.dataset['popoverLevel']) : -1;
    const newLevel = parentLevel + 1;
    // Already showing this uuid at this level — no-op.
    if (stack[newLevel]?.uuid === uuid) return;
    // Prefetch during the open delay so the popover opens with cached
    // content when possible instead of flashing the loading state.
    void loadDoc(uuid);
    cancelOpen();
    const anchorRect = link.getBoundingClientRect();
    openTimerRef.current = window.setTimeout(() => {
      setStack((curr) => [...curr.slice(0, newLevel), { uuid, anchorRect }]);
      openTimerRef.current = null;
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleMouseOut = (target: Element | null, related: Element | null): void => {
    const link = target?.closest('[data-uuid]') as HTMLElement | null;
    if (!link || link.hasAttribute('data-uuid-popover')) return;
    // If we were about to open but the user slid off before the delay
    // elapsed, just drop the pending open — no popover was ever shown.
    cancelOpen();
    // Moving into a popover keeps that level (and anything below)
    // alive. The popover's own onMouseEnter decides what to trim.
    if (related && related.closest('[data-uuid-popover]')) return;
    // Moving off every link / popover: close everything after a beat
    // so the cursor can still bridge back in without flicker.
    scheduleCloseToLength(0);
  };

  // React's root-level event delegation doesn't fire for elements
  // rendered inside a createPortal target outside the root container,
  // so we keep a ref to the latest closures and re-attach native
  // listeners to each popover div in the effect below.
  // eslint-disable-next-line react-hooks/refs -- snapshot latest closures so the effect below sees fresh handleMouseOver/Out
  latestHandlersRef.current = {
    over: (e) => {
      handleMouseOver(e.target as Element | null, (e.relatedTarget as Element | null) ?? null);
    },
    out: (e) => {
      handleMouseOut(e.target as Element | null, (e.relatedTarget as Element | null) ?? null);
    },
  };

  useEffect(() => {
    const overProxy = (e: MouseEvent): void => {
      latestHandlersRef.current.over(e);
    };
    const outProxy = (e: MouseEvent): void => {
      latestHandlersRef.current.out(e);
    };
    const attached: HTMLDivElement[] = [];
    for (const el of popoverElsRef.current.values()) {
      el.addEventListener('mouseover', overProxy);
      el.addEventListener('mouseout', outProxy);
      attached.push(el);
    }
    return () => {
      for (const el of attached) {
        el.removeEventListener('mouseover', overProxy);
        el.removeEventListener('mouseout', outProxy);
      }
    };
    // The popoverElsRef map is populated by ref callbacks as popovers
    // mount/unmount; re-run every time the stack length changes so
    // newly-mounted popover elements get their listeners.
  }, [stack.length]);

  const onMouseOver = (e: React.MouseEvent<HTMLElement>): void => {
    handleMouseOver(e.target as Element, (e.relatedTarget as Element | null) ?? null);
  };
  const onMouseOut = (e: React.MouseEvent<HTMLElement>): void => {
    handleMouseOut(e.target as Element, (e.relatedTarget as Element | null) ?? null);
  };

  const positions = stack.reduce<Array<{ top: number; left: number }>>((acc, level, idx) => {
    const maxLeft = window.innerWidth - POPOVER_WIDTH - 12;
    if (idx === 0) {
      acc.push({
        top: level.anchorRect.bottom + POPOVER_GAP,
        left: Math.max(12, Math.min(level.anchorRect.left, maxLeft)),
      });
      return acc;
    }
    const parent = acc[idx - 1];
    if (parent === undefined) {
      acc.push({
        top: level.anchorRect.bottom + POPOVER_GAP,
        left: Math.max(12, Math.min(level.anchorRect.left, maxLeft)),
      });
      return acc;
    }
    // Prefer right of the parent; if that overflows the viewport,
    // fall back to the left side so the preview stays reachable.
    const rightOfParent = parent.left + POPOVER_WIDTH + POPOVER_GAP;
    const leftOfParent = parent.left - POPOVER_WIDTH - POPOVER_GAP;
    const left = rightOfParent <= maxLeft ? rightOfParent : Math.max(12, leftOfParent);
    acc.push({ top: parent.top, left });
    return acc;
  }, []);

  const popover =
    stack.length > 0 ? (
      <>
        {stack.map((level, idx) => {
          const pos = positions[idx];
          if (pos === undefined) return null;
          const state = docs.get(level.uuid);
          return createPortal(
            <div
              key={idx.toString()}
              ref={(el): void => {
                if (el) popoverElsRef.current.set(idx, el);
                else popoverElsRef.current.delete(idx);
              }}
              data-uuid-popover
              data-popover-level={idx.toString()}
              data-testid={idx === 0 ? 'uuid-hover-popover' : `uuid-hover-popover-${idx.toString()}`}
              onMouseEnter={(): void => {
                // Cursor landed in this popover — any pending close was
                // about to trim too far. Cancel it and re-schedule a
                // trim that keeps this level (and parents) alive.
                cancelClose();
                scheduleCloseToLength(idx + 1);
              }}
              onMouseLeave={(evt): void => {
                const rel = evt.relatedTarget as Element | null;
                // Moving to any other popover — let its onMouseEnter
                // decide the trim level.
                if (rel && rel.closest('[data-uuid-popover]')) return;
                scheduleCloseToLength(0);
              }}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
              className="z-50 rounded border border-pf-border bg-pf-bg p-4 text-left shadow-xl"
            >
              <PopoverBody state={state} />
            </div>,
            document.body,
          );
        })}
      </>
    ) : null;

  return {
    delegationHandlers: { onMouseOver, onMouseOut },
    popover,
  };
}

function PopoverBody({ state }: { state: DocState | undefined }): React.ReactElement {
  if (!state || state.kind === 'loading') {
    return <p className="text-xs italic text-pf-alt">Loading…</p>;
  }
  if (state.kind === 'error') {
    return <p className="text-xs text-pf-primary">Couldn&apos;t load: {state.message}</p>;
  }
  return <DocPreview doc={state.doc} />;
}

function DocPreview({ doc }: { doc: CompendiumDocument }): React.ReactElement {
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
      <div className="mb-2 flex items-start gap-2">
        {doc.img && (
          <img src={doc.img} alt="" className="h-10 w-10 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
        )}
        <div className="min-w-0 flex-1">
          <h4 className="font-serif text-base font-semibold text-pf-text">{doc.name}</h4>
          <p className="text-[10px] uppercase tracking-widest text-pf-alt">
            {doc.type}
            {level !== undefined && ` · Level ${level.toString()}`}
          </p>
          {traits.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {traits.slice(0, 8).map((t) => (
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
          className="max-h-[28rem] overflow-y-auto pr-1 text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2 [&_p]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: enrichDescription(description) }}
        />
      ) : (
        <p className="text-xs italic text-pf-alt">No description.</p>
      )}
    </div>
  );
}
