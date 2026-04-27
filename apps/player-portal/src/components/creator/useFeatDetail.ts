import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CompendiumDocument, CompendiumMatch } from '../../api/types';
import { evaluateDocument } from '../../prereqs';
import type { CharacterContext, Evaluation } from '../../prereqs';

export type DetailState =
  | { kind: 'idle' }
  | { kind: 'loading'; uuid: string }
  | { kind: 'ready'; doc: CompendiumDocument }
  | { kind: 'error'; message: string };

/**
 * Manages selecting a match → fetching its full document → returning
 * detail state. Cache hits from the background prefetch short-circuit
 * the fetch. Stale fetches are cancelled on rapid target changes.
 */
export function useFeatDetail(
  docCacheRef: React.RefObject<Map<string, CompendiumDocument>>,
  characterContext: CharacterContext | undefined,
  setEvaluations: React.Dispatch<React.SetStateAction<Map<string, Evaluation>>>,
): {
  detailTarget: CompendiumMatch | null;
  setDetailTarget: React.Dispatch<React.SetStateAction<CompendiumMatch | null>>;
  detail: DetailState;
} {
  const [detailTarget, setDetailTarget] = useState<CompendiumMatch | null>(null);
  const [detail, setDetail] = useState<DetailState>({ kind: 'idle' });

  useEffect(() => {
    if (!detailTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail({ kind: 'idle' });
      return;
    }
    const cached = docCacheRef.current.get(detailTarget.uuid);
    if (cached) {
      setDetail({ kind: 'ready', doc: cached });
      return;
    }
    let cancelled = false;
    setDetail({ kind: 'loading', uuid: detailTarget.uuid });
    api
      .getCompendiumDocument(detailTarget.uuid)
      .then((result) => {
        if (cancelled) return;
        docCacheRef.current.set(detailTarget.uuid, result.document);
        setDetail({ kind: 'ready', doc: result.document });
        if (characterContext) {
          const evaluation = evaluateDocument(result.document, characterContext);
          setEvaluations((prev) => {
            if (prev.get(result.document.uuid) === evaluation) return prev;
            const next = new Map(prev);
            next.set(result.document.uuid, evaluation);
            return next;
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setDetail({ kind: 'error', message });
      });
    return (): void => {
      cancelled = true;
    };
    // detailTarget.uuid is the only dep that should trigger a refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTarget?.uuid]);

  return { detailTarget, setDetailTarget, detail };
}
