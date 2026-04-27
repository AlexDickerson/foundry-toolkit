import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CompendiumMatch } from '../../api/types';
import { enrichDescription } from '@foundry-toolkit/shared/foundry-enrichers';
import { useUuidHover } from '../../lib/useUuidHover';
import { extractDetailBio } from './feat-bio';
import { type DetailState } from './useFeatDetail';

export function FeatDetailPanel({
  target,
  detail,
  prereqCache,
  onPick,
  onClose,
}: {
  target: CompendiumMatch | null;
  detail: DetailState;
  prereqCache: React.RefObject<Map<string, string | null>>;
  onPick: () => void;
  onClose: () => void;
}): React.ReactElement | null {
  const uuidHover = useUuidHover();
  const [prereqResolutions, setPrereqResolutions] = useState<Map<string, string | null>>(new Map());

  const doc = detail.kind === 'ready' ? detail.doc : null;
  const bio = extractDetailBio(doc);
  const prereqsKey = (bio.prerequisites ?? []).join('|');

  useEffect(() => {
    const prereqs = bio.prerequisites;
    if (!prereqs || prereqs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrereqResolutions(new Map());
      return;
    }
    let cancelled = false;
    const initial = new Map<string, string | null>();
    for (const p of prereqs) {
      const cached = prereqCache.current.get(p.toLowerCase());
      if (cached !== undefined) initial.set(p, cached);
    }
    setPrereqResolutions(initial);

    // The prefetch usually has these cached already, but fall back to
    // on-demand lookup for anything still missing.
    void (async (): Promise<void> => {
      await Promise.all(
        prereqs.map(async (text) => {
          const key = text.toLowerCase();
          if (prereqCache.current.has(key)) return;
          try {
            const response = await api.searchCompendium({ q: text, documentType: 'Item', limit: 5 });
            const exact = response.matches.find((m) => m.name.toLowerCase() === key);
            const uuid = exact?.uuid ?? null;
            prereqCache.current.set(key, uuid);
            if (!cancelled) {
              setPrereqResolutions((prev) => {
                const next = new Map(prev);
                next.set(text, uuid);
                return next;
              });
            }
          } catch {
            prereqCache.current.set(key, null);
            if (!cancelled) {
              setPrereqResolutions((prev) => {
                const next = new Map(prev);
                next.set(text, null);
                return next;
              });
            }
          }
        }),
      );
    })();

    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prereqsKey]);

  if (!target) return null;
  return (
    <aside className="flex min-w-0 flex-1 flex-col" data-testid="feat-picker-detail" data-detail-uuid={target.uuid}>
      <header className="flex items-start gap-3 border-b border-pf-border px-4 py-3">
        {target.img && (
          <img src={target.img} alt="" className="h-12 w-12 shrink-0 rounded border border-pf-border bg-pf-bg-dark" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-semibold text-pf-text">{target.name}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-pf-alt">
            {target.packLabel}
            {target.level !== undefined && ` · L${target.level.toString()}`}
          </p>
          {target.traits && target.traits.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {target.traits.map((t) => (
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {detail.kind === 'loading' && <p className="text-sm italic text-pf-alt">Loading…</p>}
        {detail.kind === 'error' && <p className="text-sm text-pf-primary">Failed to load: {detail.message}</p>}
        {detail.kind === 'ready' && (
          <div className="space-y-3">
            {bio.prerequisites && bio.prerequisites.length > 0 && (
              <PrereqRow prereqs={bio.prerequisites} resolutions={prereqResolutions} />
            )}
            {bio.actions && <DetailRow label="Actions" value={bio.actions} />}
            {bio.trigger && <DetailRow label="Trigger" value={bio.trigger} />}
            {bio.frequency && <DetailRow label="Frequency" value={bio.frequency} />}
            {bio.requirements && <DetailRow label="Requirements" value={bio.requirements} />}
            {bio.description && (
              <div
                {...uuidHover.delegationHandlers}
                className="text-sm leading-relaxed text-pf-text [&_.pf-damage]:font-semibold [&_.pf-damage]:text-pf-primary [&_.pf-template]:italic [&_.pf-template]:text-pf-secondary [&_a]:cursor-pointer [&_a]:text-pf-primary [&_a]:underline [&_p]:my-2 [&_p]:leading-relaxed"
                // Trusted source: our own Foundry. enrichDescription converts
                // Foundry enricher tokens into styled inline elements.
                dangerouslySetInnerHTML={{ __html: enrichDescription(bio.description) }}
              />
            )}
            {uuidHover.popover}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-pf-border bg-pf-bg px-3 py-1 text-xs font-semibold uppercase tracking-widest text-pf-alt-dark hover:text-pf-primary"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onPick}
          data-testid="feat-picker-pick"
          className="rounded border border-pf-primary bg-pf-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white hover:brightness-110"
        >
          Pick {target.name}
        </button>
      </footer>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">{label}</dt>
      <dd className="text-sm text-pf-text">{value}</dd>
    </div>
  );
}

function PrereqRow({
  prereqs,
  resolutions,
}: {
  prereqs: string[];
  resolutions: Map<string, string | null>;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-pf-alt-dark">
        Prerequisites
      </dt>
      <dd className="text-sm text-pf-text">
        {prereqs.map((p, i) => {
          const uuid = resolutions.get(p);
          return (
            <span key={`${p}-${i.toString()}`}>
              {i > 0 && '; '}
              {uuid ? (
                <a data-uuid={uuid} className="cursor-pointer text-pf-primary underline" title={uuid}>
                  {p}
                </a>
              ) : (
                p
              )}
            </span>
          );
        })}
      </dd>
    </div>
  );
}
