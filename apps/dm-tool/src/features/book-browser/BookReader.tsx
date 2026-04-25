import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, List, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { pdfjsLib } from '@/lib/pdfjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { extractCover } from './useBooks';
import { partSubtitle } from './ap-merge';

import { MultiDocPageList } from './BookReader/MultiDocPageList';
import { PageIndicator } from './BookReader/PageIndicator';
import { tagNodes, TocTree } from './BookReader/TocTree';
import { loadScroll, PAGE_GAP, SEPARATOR_HEIGHT, saveScroll, scrollKey } from './BookReader/scroll';
import type { DocSlot, OutlineNode, ReaderProps, TaggedOutlineNode } from './BookReader/types';
import { cycleZoom, loadZoom, resolveScale, saveZoom, type ZoomPreset, ZOOM_PRESETS } from './BookReader/zoom';

export function BookReader({ bookId, apGroup, onClose, onBack, onIngestComplete }: ReaderProps) {
  const isMulti = !!apGroup;
  const [title, setTitle] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const [slots, setSlots] = useState<DocSlot[]>([]);
  const slotsRef = useRef<DocSlot[]>([]);
  slotsRef.current = slots;
  const [tocOpen, setTocOpen] = useState(true);
  const [zoom, setZoom] = useState<ZoomPreset>(loadZoom);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputOpen, setPageInputOpen] = useState(false);

  // Destroy all loaded PDFDocumentProxy objects on unmount so they don't
  // leak memory across open/close cycles.
  useEffect(() => {
    return () => {
      for (const s of slotsRef.current) {
        if (s.doc) s.doc.destroy();
      }
    };
  }, []);

  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize({
        width: el.clientWidth - 24,
        height: el.clientHeight,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // -----------------------------------------------------------------------
  // Single-book mode
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isMulti || bookId == null) return;
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    (async () => {
      try {
        const b = await api.booksGet(bookId);
        if (cancelled || !b) return;
        setTitle(b.title);

        const fileUrl = await api.booksGetFileUrl(bookId);
        if (cancelled) return;

        const task = pdfjsLib.getDocument({
          url: fileUrl,
          disableAutoFetch: true,
          disableStream: true,
        });
        loadingTask = task;
        const doc = await task.promise;
        if (cancelled) return;

        const page1 = await doc.getPage(1);
        if (cancelled) return;
        const vp = page1.getViewport({ scale: 1 });
        setPageSize({ width: vp.width, height: vp.height });

        const outline = ((await doc.getOutline()) as OutlineNode[]) ?? [];
        if (cancelled) return;

        setSlots([
          {
            bookId,
            partLabel: b.title,
            pageCount: doc.numPages,
            globalPageOffset: 0,
            doc,
            outline,
          },
        ]);
        setTotalPages(doc.numPages);

        if (!b.ingested) {
          extractCover(b.id).then(onIngestComplete).catch(console.error);
        }
      } catch (e) {
        console.error('[BookReader] single-doc load failed:', e);
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [bookId, isMulti]);

  // -----------------------------------------------------------------------
  // Multi-doc AP mode
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isMulti || !apGroup) return;
    let cancelled = false;

    setTitle(apGroup.subcategory);

    (async () => {
      try {
        // Build initial slots from DB page counts. Parts without a page
        // count get loaded eagerly to read numPages (fast with disableAutoFetch).
        const parts = apGroup.parts;
        const initialSlots: DocSlot[] = [];
        let offset = 0;

        for (const p of parts) {
          let pageCount = p.book.pageCount ?? 0;
          let doc: PDFDocumentProxy | null = null;

          if (!pageCount) {
            // Need to load this doc to learn its page count.
            const url = await api.booksGetFileUrl(p.book.id);
            if (cancelled) return;
            const task = pdfjsLib.getDocument({
              url,
              disableAutoFetch: true,
              disableStream: true,
            });
            doc = await task.promise;
            if (cancelled) {
              doc.destroy();
              return;
            }
            pageCount = doc.numPages;
          }

          initialSlots.push({
            bookId: p.book.id,
            partLabel: `Part ${p.partNumber} — ${partSubtitle(p.book.title)}`,
            pageCount,
            globalPageOffset: offset,
            doc,
            outline: [],
          });
          offset += pageCount;
        }
        if (cancelled) return;

        setSlots(initialSlots);
        setTotalPages(offset);

        // Read page size from first available doc.
        let firstDoc = initialSlots.find((s) => s.doc)?.doc;
        if (!firstDoc) {
          const url = await api.booksGetFileUrl(initialSlots[0]!.bookId);
          if (cancelled) return;
          const task = pdfjsLib.getDocument({
            url,
            disableAutoFetch: true,
            disableStream: true,
          });
          firstDoc = await task.promise;
          if (cancelled) {
            firstDoc.destroy();
            return;
          }
          initialSlots[0]!.doc = firstDoc;
          setSlots([...initialSlots]);
        }

        const page1 = await firstDoc.getPage(1);
        if (cancelled) return;
        const vp = page1.getViewport({ scale: 1 });
        setPageSize({ width: vp.width, height: vp.height });

        // Load outlines for docs we already have open.
        for (const s of initialSlots) {
          if (s.doc && cancelled) return;
          if (s.doc) {
            s.outline = ((await s.doc.getOutline()) as OutlineNode[]) ?? [];
          }
        }
        if (!cancelled) setSlots([...initialSlots]);

        // Ingest any un-ingested parts.
        for (const p of parts) {
          if (cancelled) break;
          if (!p.book.ingested) {
            extractCover(p.book.id).catch(console.error);
          }
        }
        onIngestComplete?.();
      } catch (e) {
        console.error('[BookReader] multi-doc load failed:', e);
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apGroup, isMulti]);

  // Lazy-load a doc when the user scrolls near it (called by PageSlot).
  // Uses slotsRef to avoid closing over a stale `slots` array, which
  // would make this callback recreate on every slots change and cause
  // unnecessary PageSlot re-renders.
  const loadSlotDoc = useCallback(async (slotIndex: number) => {
    const current = slotsRef.current[slotIndex];
    if (!current || current.doc) return current?.doc ?? null;

    const url = await api.booksGetFileUrl(current.bookId);
    const task = pdfjsLib.getDocument({
      url,
      disableAutoFetch: true,
      disableStream: true,
    });
    const doc = await task.promise;
    const outline = ((await doc.getOutline()) as OutlineNode[]) ?? [];

    setSlots((prev) => {
      const next = [...prev];
      const slot = next[slotIndex];
      if (slot && !slot.doc) {
        next[slotIndex] = { ...slot, doc, outline };
      }
      return next;
    });

    return doc;
  }, []);

  // Persist zoom preference.
  useEffect(() => {
    saveZoom(zoom);
  }, [zoom]);

  // Computed scale.
  const scale = useMemo(() => {
    if (!pageSize) return 1;
    return resolveScale(zoom, containerSize.width, containerSize.height, pageSize.width, pageSize.height);
  }, [zoom, pageSize, containerSize]);

  const pageHeight = pageSize ? Math.round(pageSize.height * scale) : 0;

  // Precompute the scroll-top offset of each slot's first page using the
  // same running-counter algorithm the page list layout uses. This is the
  // single source of truth for both rendering and TOC navigation — no
  // independent formula that could drift.
  const slotTopOffsets = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (let si = 0; si < slots.length; si++) {
      if (si > 0) y += SEPARATOR_HEIGHT;
      offsets.push(y);
      y += slots[si]!.pageCount * (pageHeight + PAGE_GAP);
    }
    return offsets;
  }, [slots, pageHeight]);

  // Combined outline for the TOC sidebar.
  const combinedOutline = useMemo((): TaggedOutlineNode[] => {
    if (slots.length === 1 && slots[0]?.outline.length) {
      return tagNodes(slots[0].outline, 0);
    }
    const nodes: TaggedOutlineNode[] = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      nodes.push({
        title: s.partLabel,
        dest: null,
        items: tagNodes(s.outline, i),
        slotIndex: i,
      });
    }
    return nodes;
  }, [slots]);

  // Resolve a TOC destination to an exact scroll position using the
  // precomputed slot offsets — no independent formula.
  const slotTopOffsetsRef = useRef(slotTopOffsets);
  slotTopOffsetsRef.current = slotTopOffsets;
  const pageHeightRef = useRef(pageHeight);
  pageHeightRef.current = pageHeight;

  // -----------------------------------------------------------------------
  // Current page tracking + scroll position save/restore
  // -----------------------------------------------------------------------
  const sKey = scrollKey(bookId, apGroup);

  // Derive current 1-based page number from scroll position.
  const computeCurrentPage = useCallback(
    (scrollTop: number) => {
      if (!pageHeight || slots.length === 0) return 1;
      for (let si = slots.length - 1; si >= 0; si--) {
        const slotTop = slotTopOffsets[si] ?? 0;
        if (scrollTop >= slotTop) {
          const local = Math.floor((scrollTop - slotTop) / (pageHeight + PAGE_GAP));
          const globalOffset = slots[si]!.globalPageOffset;
          return Math.min(globalOffset + local + 1, totalPages);
        }
      }
      return 1;
    },
    [slots, slotTopOffsets, pageHeight, totalPages],
  );

  // Track scroll → update current page + debounced save.
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setCurrentPage(computeCurrentPage(el.scrollTop));
      // Debounce the localStorage write.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveScroll(sKey, el.scrollTop);
      }, 300);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [computeCurrentPage, sKey]);

  // Restore saved scroll position once pages are laid out.
  // Guard: el.clientHeight === 0 when the tab is hidden (display:none),
  // so setting scrollTop is a no-op. Defer until the tab becomes visible
  // (ResizeObserver will trigger a containerSize → pageHeight change).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !pageHeight || slots.length === 0) return;
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return;
    const saved = loadScroll(sKey);
    if (saved > 0) {
      el.scrollTop = saved;
      setCurrentPage(computeCurrentPage(saved));
    }
    restoredRef.current = true;
  }, [pageHeight, slots, sKey, computeCurrentPage, containerSize]);

  // Jump to a specific 1-based page number.
  const jumpToPage = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el || !pageHeight || slots.length === 0) return;
      const clamped = Math.max(1, Math.min(page, totalPages));
      // Find which slot this page belongs to.
      let targetTop = 0;
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si]!;
        const slotEnd = slot.globalPageOffset + slot.pageCount;
        if (clamped <= slotEnd) {
          const local = clamped - 1 - slot.globalPageOffset;
          targetTop = (slotTopOffsets[si] ?? 0) + local * (pageHeight + PAGE_GAP);
          break;
        }
      }
      el.scrollTop = targetTop;
    },
    [slots, slotTopOffsets, pageHeight, totalPages],
  );

  const resolveDest = useCallback(
    async (dest: string | unknown[] | null, slotIndex: number): Promise<number | null> => {
      const offsets = slotTopOffsetsRef.current;
      const ph = pageHeightRef.current;
      const slotTop = offsets[slotIndex];
      if (slotTop == null || !ph) return null;
      const slot = slotsRef.current[slotIndex];
      if (!slot) return null;

      if (!dest) return slotTop;

      let doc = slot.doc;
      if (!doc) {
        doc = await loadSlotDoc(slotIndex);
        if (!doc) return null;
      }

      let resolved: unknown[] | null = null;
      if (typeof dest === 'string') {
        resolved = await doc.getDestination(dest);
      } else if (Array.isArray(dest)) {
        resolved = dest;
      }
      if (!resolved || resolved.length === 0) return null;

      const localPageIndex = await doc.getPageIndex(resolved[0] as { num: number; gen: number });
      return slotTop + localPageIndex * (ph + PAGE_GAP);
    },
    [loadSlotDoc],
  );

  // Keyboard shortcuts.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't capture keys when the page-number input is focused.
      if (pageInputOpen) return;
      const el = scrollRef.current;
      if (!el) return;
      const ph = pageHeightRef.current;
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          cycleZoom(1, zoom, setZoom);
          break;
        case '-':
          e.preventDefault();
          cycleZoom(-1, zoom, setZoom);
          break;
        case '0':
          e.preventDefault();
          setZoom('fit-width');
          break;
        case 'Home':
          e.preventDefault();
          el.scrollTop = 0;
          break;
        case 'End':
          e.preventDefault();
          el.scrollTop = el.scrollHeight;
          break;
        case 'PageDown':
          e.preventDefault();
          if (ph) el.scrollTop += ph + PAGE_GAP;
          break;
        case 'PageUp':
          e.preventDefault();
          if (ph) el.scrollTop -= ph + PAGE_GAP;
          break;
      }
    },
    [zoom, pageInputOpen],
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-destructive">This PDF could not be opened.</p>
        <p className="max-w-md text-xs text-muted-foreground">
          The file may be corrupted, password-protected, or not a standard PDF. Common with pregenerated character
          sheets and form-fillable documents.
        </p>
        <p className="max-w-md text-[10px] font-mono text-muted-foreground/60 break-all">{error}</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Back to catalog
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button variant="ghost" size="sm" onClick={onBack ?? onClose} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="text-xs">Catalog</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <span className="truncate text-xs font-medium">{title || 'Loading…'}</span>
        {totalPages > 0 && (
          <PageIndicator
            currentPage={currentPage}
            totalPages={totalPages}
            isMulti={isMulti}
            slotCount={slots.length}
            open={pageInputOpen}
            onOpenChange={setPageInputOpen}
            onJump={jumpToPage}
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Toggle table of contents"
            onClick={() => setTocOpen((v) => !v)}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          {ZOOM_PRESETS.map((z) => (
            <button
              key={z.value}
              type="button"
              onClick={() => setZoom(z.value)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                zoom === z.value ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {z.label}
            </button>
          ))}
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Zoom out"
            onClick={() => cycleZoom(-1, zoom, setZoom)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Zoom in"
            onClick={() => cycleZoom(1, zoom, setZoom)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Reset zoom"
            onClick={() => setZoom('fit-width')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content: TOC sidebar + page area */}
      <div className="flex min-h-0 flex-1">
        {tocOpen && combinedOutline.length > 0 && (
          <div className="w-64 shrink-0 border-r border-border">
            <ScrollArea className="h-full">
              <div className="p-2">
                <TocTree nodes={combinedOutline} resolveDest={resolveDest} scrollRef={scrollRef} />
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Page scroll container — double-click toggles between
            fit-width and 100% for quick switching between reading
            and inspecting art/maps. */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-muted/30"
          style={{ outline: 'none' }}
          onDoubleClick={() => setZoom((z) => (z === 'fit-width' ? '100' : 'fit-width'))}
        >
          {slots.length > 0 && pageSize ? (
            <MultiDocPageList
              slots={slots}
              slotTopOffsets={slotTopOffsets}
              pageHeight={pageHeight}
              pageWidth={Math.round(pageSize.width * scale)}
              scale={scale}
              loadSlotDoc={loadSlotDoc}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading PDF…</div>
          )}
        </div>

        <div data-slot="reader-sidebar" />
      </div>
    </div>
  );
}
