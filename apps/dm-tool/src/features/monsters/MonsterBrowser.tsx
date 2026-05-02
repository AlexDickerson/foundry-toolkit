import { useCallback, useMemo, useState } from 'react';
import { ResizableSidebar } from '@/components/ResizableSidebar';
import { DetailOverlay } from '@/components/FloatingPanel';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { MonsterFilterPanel } from './MonsterFilterPanel';
import { MonsterCardGrid } from './MonsterCardGrid';
import { MonsterDetailPane } from './MonsterDetailPane';
import { useMonsterSearch, useMonsterFacets, useMonsterDetail, useOpenExternal } from './useMonsters';
import type { MonsterSearchParams } from '@foundry-toolkit/shared/types';

export function MonsterBrowser({
  keywords = '',
  cardSize,
  onPick,
  onPickCancel,
}: {
  keywords?: string;
  cardSize?: number;
  /** When set, the browser is in combat-pick mode: clicking a card immediately
   *  invokes this callback instead of opening the detail overlay. */
  onPick?: (name: string) => void;
  onPickCancel?: () => void;
}) {
  const [filters, setFilters] = useState<MonsterSearchParams>({});
  const [selectedMonster, setSelectedMonster] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const searchParams = useMemo<MonsterSearchParams>(
    () => ({
      ...filters,
      keywords: keywords.trim() || undefined,
    }),
    [filters, keywords],
  );

  const { data: monsters, error } = useMonsterSearch(searchParams);
  const { data: facets } = useMonsterFacets();
  const { data: detail, loading: detailLoading } = useMonsterDetail(selectedMonster);
  const openExternal = useOpenExternal();

  const handleSelect = useCallback(
    (name: string) => {
      if (name === selectedMonster) {
        setClosing(true);
      } else {
        setClosing(false);
        setSelectedMonster(name);
      }
    },
    [selectedMonster],
  );

  const handleClose = useCallback(() => setClosing(true), []);
  useEscapeToClose(handleClose, selectedMonster !== null);
  const handleClosed = useCallback(() => {
    setSelectedMonster(null);
    setClosing(false);
  }, []);

  const handleFiltersChange = useCallback((next: MonsterSearchParams) => {
    setFilters(next);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {onPick && (
        <div className="flex shrink-0 items-center gap-3 border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-xs text-primary">
          <span className="flex-1">Picking for combat — click a monster to add it to the encounter</span>
          {onPickCancel && (
            <button type="button" onClick={onPickCancel} className="text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ResizableSidebar storageKey="dmtool.sidebar.monsters">
          <MonsterFilterPanel facets={facets} params={filters} onChange={handleFiltersChange} />
        </ResizableSidebar>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <MonsterCardGrid
            monsters={monsters ?? []}
            error={error}
            selected={selectedMonster}
            onSelect={onPick ?? handleSelect}
            cardSize={cardSize}
          />

          {selectedMonster && detail && (
            <DetailOverlay storageKey="dmtool.detail.monsters" closing={closing} onClosed={handleClosed}>
              <MonsterDetailPane
                detail={detail}
                loading={detailLoading}
                onOpenExternal={openExternal}
                onClose={handleClose}
              />
            </DetailOverlay>
          )}
        </div>
      </div>
    </div>
  );
}
