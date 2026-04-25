import { useCallback, useEffect, useMemo, useState } from 'react';
import { Library, RefreshCw, Sparkles, X } from 'lucide-react';
import { ResizableSidebar } from '@/components/ResizableSidebar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Book } from '@foundry-toolkit/shared/types';
import { useBackgroundIngest, useBookClassify, useBookList, useBookScan } from './useBooks';
import { BookReader } from './BookReader';
import { groupAdventurePaths } from './ap-merge';

import { BookContextMenu } from './BookBrowser/BookContextMenu';
import { CatalogGrid } from './BookBrowser/CatalogGrid';
import { BROWSER_TAB, CATEGORY_ORDER, SYSTEM_ORDER } from './BookBrowser/constants';
import {
  effectiveCategory,
  effectivePublisher,
  effectiveSystem,
  effectiveTitle,
  isApCategory,
  loadPersistedTabs,
  persistTabs,
} from './BookBrowser/helpers';
import { NavItem, SystemGroup } from './BookBrowser/sidebar';
import type { CatalogEntry, TabDef } from './BookBrowser/types';

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function BookBrowser({ keywords = '' }: { keywords?: string }) {
  const { data: books, loading, error, refetch } = useBookList();
  const { scan, scanning } = useBookScan();
  const {
    classify,
    cancel: cancelClassify,
    running: classifying,
    current: classifyCurrent,
    total: classifyTotal,
  } = useBookClassify();
  // Hook triggers background cover extraction — side-effect only.
  useBackgroundIngest(books, refetch);

  const [classifyError, setClassifyError] = useState<string | null>(null);
  const handleClassify = useCallback(
    async (reclassify?: boolean) => {
      setClassifyError(null);
      try {
        await classify(reclassify);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setClassifyError(msg);
        console.error('Classification error:', e);
      }
      refetch();
    },
    [classify, refetch],
  );
  const filter = keywords;
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null);
  const [tabs, setTabs] = useState<TabDef[]>([BROWSER_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>('browser');
  const [tabsRestored, setTabsRestored] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; book: Book } | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const openTab = useCallback((tab: TabDef) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev;
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    if (tabId === 'browser') return; // can't close browser tab
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTabId((prev) => (prev === tabId ? 'browser' : prev));
  }, []);

  const handleUpdateMeta = useCallback(
    async (bookId: number, fields: { aiSystem?: string; aiCategory?: string }) => {
      await api.booksUpdateMeta({ id: bookId, fields });
      refetch();
    },
    [refetch],
  );

  const selectNav = useCallback((sys: string | null, cat: string | null, pub: string | null) => {
    setSelectedSystem(sys);
    setSelectedCategory(cat);
    setSelectedPublisher(pub);
  }, []);

  const handleRescan = useCallback(async () => {
    await scan();
    refetch();
  }, [scan, refetch]);

  // Split books into merged AP groups + everything else.
  const { apGroups, otherBooks } = useMemo(
    () => (books ? groupAdventurePaths(books) : { apGroups: [], otherBooks: [] }),
    [books],
  );

  // Rehydrate persisted tabs once books have loaded.
  useEffect(() => {
    if (tabsRestored || !books) return;
    setTabsRestored(true);
    const saved = loadPersistedTabs();
    if (!saved || saved.tabs.length <= 1) return;
    const apByName = new Map(apGroups.map((g) => [g.subcategory, g]));
    const bookById = new Map(books.map((b) => [b.id, b]));
    const restored: TabDef[] = [BROWSER_TAB];
    for (const pt of saved.tabs) {
      if (pt.kind === 'browser') continue;
      if (pt.kind === 'book') {
        if (bookById.has(pt.bookId)) restored.push(pt);
      } else if (pt.kind === 'ap') {
        const group = apByName.get(pt.subcategory);
        if (group) restored.push({ id: pt.id, kind: 'ap', group, title: pt.title });
      }
    }
    if (restored.length > 1) {
      setTabs(restored);
      setActiveTabId(restored.some((t) => t.id === saved.activeTabId) ? saved.activeTabId : 'browser');
    }
  }, [books, apGroups, tabsRestored]);

  // Persist tabs whenever they change.
  useEffect(() => {
    if (!tabsRestored) return;
    persistTabs(tabs, activeTabId);
  }, [tabs, activeTabId, tabsRestored]);

  // Build 3-level sidebar tree: System → Category → Publisher.
  const systems = useMemo(() => {
    if (!books) return [];

    // system → category → publisher → book count
    const tree = new Map<string, Map<string, Map<string, number>>>();
    for (const b of books) {
      const sys = effectiveSystem(b);
      const cat = effectiveCategory(b);
      const pub = effectivePublisher(b) ?? 'Unknown';
      if (!tree.has(sys)) tree.set(sys, new Map());
      const catMap = tree.get(sys)!;
      if (!catMap.has(cat)) catMap.set(cat, new Map());
      const pubMap = catMap.get(cat)!;
      pubMap.set(pub, (pubMap.get(pub) ?? 0) + 1);
    }

    // AP groups per system (for count correction)
    const apCountBySys = new Map<string, number>();
    for (const g of apGroups) {
      const first = g.parts[0]?.book;
      if (!first) continue;
      const sys = effectiveSystem(first);
      apCountBySys.set(sys, (apCountBySys.get(sys) ?? 0) + 1);
    }

    return Array.from(tree.entries())
      .map(([sysName, catMap]) => ({
        name: sysName,
        categories: Array.from(catMap.entries())
          .map(([catName, pubMap]) => ({
            name: catName,
            publishers: Array.from(pubMap.entries())
              .map(([pubName, count]) => ({ name: pubName, count }))
              .sort((a, b) => b.count - a.count),
            count: isApCategory(catName)
              ? (apCountBySys.get(sysName) ?? 0)
              : Array.from(pubMap.values()).reduce((s, c) => s + c, 0),
          }))
          .sort((a, b) => {
            const ai = CATEGORY_ORDER.indexOf(a.name);
            const bi = CATEGORY_ORDER.indexOf(b.name);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          }),
        count: Array.from(catMap.values()).reduce(
          (s, pubMap) => s + Array.from(pubMap.values()).reduce((s2, c) => s2 + c, 0),
          0,
        ),
      }))
      .sort((a, b) => {
        const ai = SYSTEM_ORDER.indexOf(a.name);
        const bi = SYSTEM_ORDER.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [books, apGroups]);

  // Build catalog entries filtered by System → Category → Publisher.
  const entries = useMemo((): CatalogEntry[] => {
    const q = filter.trim().toLowerCase();
    const out: CatalogEntry[] = [];

    // Filter non-AP books.
    const byCat = new Map<string, Book[]>();
    for (const b of otherBooks) {
      const sys = effectiveSystem(b);
      const cat = effectiveCategory(b);
      const pub = effectivePublisher(b) ?? 'Unknown';
      if (selectedSystem && sys !== selectedSystem) continue;
      if (selectedCategory && cat !== selectedCategory) continue;
      if (selectedPublisher && pub !== selectedPublisher) continue;
      if (q && !effectiveTitle(b).toLowerCase().includes(q)) continue;
      let list = byCat.get(cat);
      if (!list) {
        list = [];
        byCat.set(cat, list);
      }
      list.push(b);
    }

    // Filter AP groups.
    const apCatName = [...byCat.keys(), ...CATEGORY_ORDER].find(isApCategory) ?? 'Adventure Path';
    const apEntries: CatalogEntry[] = [];
    for (const g of apGroups) {
      const first = g.parts[0]?.book;
      if (!first) continue;
      const sys = effectiveSystem(first);
      const pub = effectivePublisher(first) ?? 'Unknown';
      if (selectedSystem && sys !== selectedSystem) continue;
      if (selectedCategory && !isApCategory(selectedCategory)) continue;
      if (selectedPublisher && pub !== selectedPublisher) continue;
      if (q && !g.subcategory.toLowerCase().includes(q)) continue;
      apEntries.push({ kind: 'ap', group: g });
      for (const s of g.supplements) {
        if (q && !effectiveTitle(s).toLowerCase().includes(q)) continue;
        apEntries.push({ kind: 'book', book: s });
      }
    }

    // Emit in category order with section headers.
    const allCats = new Set([...CATEGORY_ORDER, ...byCat.keys()]);
    if (apEntries.length > 0) allCats.add(apCatName);
    const sorted = [...allCats].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    for (const cat of sorted) {
      const catEntries: CatalogEntry[] = [];
      if (isApCategory(cat)) catEntries.push(...apEntries);
      const catBooks = byCat.get(cat);
      if (catBooks) for (const b of catBooks) catEntries.push({ kind: 'book', book: b });
      if (catEntries.length === 0) continue;
      if (!selectedCategory) out.push({ kind: 'section', label: cat });
      out.push(...catEntries);
    }

    return out;
  }, [apGroups, otherBooks, selectedSystem, selectedCategory, selectedPublisher, filter]);

  const isBrowserActive = activeTabId === 'browser';

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar — only show when more than just the browser tab */}
      {tabs.length > 1 && (
        <TabBar tabs={tabs} activeTabId={activeTabId} onActivate={setActiveTabId} onClose={closeTab} />
      )}
      <div className="flex min-h-0 flex-1">
        {/* Category rail — only visible on browser tab */}
        {isBrowserActive && (
          <ResizableSidebar storageKey="dmtool.sidebar.books">
            <div className="flex h-full flex-col border-r border-border bg-card">
              <div className="flex h-12 items-center justify-between px-3">
                <span
                  className="text-sm text-foreground"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                >
                  Categories
                </span>
                <div className="flex items-center gap-1">
                  {classifying ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                      title="Cancel classification"
                      onClick={cancelClassify}
                    >
                      <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                      {classifyCurrent}/{classifyTotal}
                      <X className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title="Classify books with AI"
                      onClick={() => handleClassify()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    title="Rescan PDF folder"
                    onClick={handleRescan}
                    disabled={scanning}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />
                  </Button>
                </div>
              </div>
              <Separator variant="ornate" />
              {classifyError && (
                <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
                  {classifyError}
                </div>
              )}
              <ScrollArea className="flex-1">
                <div className="py-1">
                  <NavItem
                    name="All Books"
                    count={apGroups.length + apGroups.reduce((n, g) => n + g.supplements.length, 0) + otherBooks.length}
                    active={!selectedSystem}
                    onClick={() => selectNav(null, null, null)}
                  />
                  {systems.map((sys) => (
                    <SystemGroup
                      key={sys.name}
                      system={sys}
                      selectedSystem={selectedSystem}
                      selectedCategory={selectedCategory}
                      selectedPublisher={selectedPublisher}
                      expandedKeys={expandedKeys}
                      onToggle={toggleExpanded}
                      onSelect={selectNav}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </ResizableSidebar>
        )}

        {/* Content area — all tabs mounted, only active one visible */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Browser tab */}
          <div className="flex-1 overflow-hidden" style={{ display: isBrowserActive ? undefined : 'none' }}>
            {entries.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Library className="h-8 w-8 opacity-50" />
                <span className="text-sm">
                  {error ? 'Could not load the book catalog.' : 'No books match the current filter.'}
                </span>
              </div>
            ) : (
              <CatalogGrid
                entries={entries}
                onSelect={(entry) => {
                  if (entry.kind === 'ap') {
                    openTab({
                      id: `ap-${entry.group.subcategory}`,
                      kind: 'ap',
                      group: entry.group,
                      title: entry.group.subcategory,
                    });
                  } else if (entry.kind === 'book') {
                    openTab({
                      id: `book-${entry.book.id}`,
                      kind: 'book',
                      bookId: entry.book.id,
                      title: effectiveTitle(entry.book),
                    });
                  }
                }}
                onBookContextMenu={(e, book) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, book });
                }}
              />
            )}
          </div>
          {/* Reader tabs */}
          {tabs.map((tab) => {
            if (tab.kind === 'browser') return null;
            return (
              <div
                key={tab.id}
                className="flex-1 overflow-hidden"
                style={{ display: activeTabId === tab.id ? undefined : 'none' }}
              >
                {tab.kind === 'ap' ? (
                  <BookReader
                    apGroup={tab.group}
                    onClose={() => closeTab(tab.id)}
                    onBack={() => setActiveTabId('browser')}
                    onIngestComplete={refetch}
                  />
                ) : (
                  <BookReader
                    bookId={tab.bookId}
                    onClose={() => closeTab(tab.id)}
                    onBack={() => setActiveTabId('browser')}
                    onIngestComplete={refetch}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {ctxMenu && (
        <BookContextMenu
          book={ctxMenu.book}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onUpdateMeta={handleUpdateMeta}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}: {
  tabs: TabDef[];
  activeTabId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div
      className="flex items-end gap-px border-b border-border"
      style={{ backgroundColor: 'hsl(var(--card))', minHeight: 32 }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const label = tab.kind === 'browser' ? 'Library' : tab.title;
        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              'group flex max-w-[200px] items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onActivate(tab.id)}
            title={label}
          >
            {tab.kind === 'browser' && <Library className="h-3 w-3 shrink-0" />}
            <span className="truncate">{label}</span>
            {tab.kind !== 'browser' && (
              <span
                role="button"
                className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                style={active ? { opacity: 1 } : undefined}
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
