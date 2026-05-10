import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, List, Minus, Plus, RotateCcw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { cn } from './lib/cn';
import { MultiDocPageList } from './reader/MultiDocPageList';
import { PageIndicator } from './reader/PageIndicator';
import { tagNodes, TocTree } from './reader/TocTree';
import { loadScroll, PAGE_GAP, SEPARATOR_HEIGHT, saveScroll } from './reader/scroll';
import type { DocSlot, OutlineNode, TaggedOutlineNode } from './reader/types';
import { cycleZoom, loadZoom, resolveScale, saveZoom, type ZoomPreset, ZOOM_PRESETS } from './reader/zoom';
import type { PdfReaderProps } from './types';

export function PdfReader({
  getBookUrl,
  bookId,
  title: titleProp,
  docSlots: docSlotsProp,
  onClose,
  onBack,
  scrollStorageKey,
  zoomStorageKey,
}: PdfReaderProps) {
  const isMulti = !!docSlotsProp && docSlotsProp.length > 0;

  const [title, setTitle] = useState(titleProp ?? '');
  const [totalPages, setTotalPages] = useState(0);
  const [slots, setSlots] = useState<DocSlot[]>([]);
  const slotsRef = useRef<DocSlot[]>([]);
  slotsRef.current = slots;

  const [tocOpen, setTocOpen] = useState(true);
  const [zoom, setZoom] = useState<ZoomPreset>(() => loadZoom(zoomStorageKey));
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputOpen, setPageInputOpen] = useState(false);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Sync title prop changes (e.g. when consumer fetches metadata async).
  useEffect(() => {
    if (titleProp) setTitle(titleProp);
  }, [titleProp]);

  // Cleanup all loaded PDFDocumentProxy objects on unmount.
  useEffect(() => {
    return () => {
      for (const s of slotsRef.current) {
        if (s.doc) s.doc.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({
        width: el.clientWidth - 24,
        height: el.clientHeight,
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Single-book mode ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isMulti || bookId == null) return;
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    (async () => {
      try {
        const fileUrl = await Promise.resolve(getBookUrl(bookId));
        if (cancelled) return;

        const task = pdfjsLib.getDocument({ url: fileUrl, disableAutoFetch: true, disableStream: true });
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
          { id: bookId, partLabel: titleProp ?? bookId, pageCount: doc.numPages, globalPageOffset: 0, doc, outline },
        ]);
        setTotalPages(doc.numPages);
      } catch (e) {
        console.error('[PdfReader] single-doc load failed:', e);
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [bookId, isMulti]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Multi-doc mode ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMulti || !docSlotsProp) return;
    let cancelled = false;

    (async () => {
      try {
        const initialSlots: DocSlot[] = [];
        let offset = 0;

        for (const s of docSlotsProp) {
          let pageCount = s.pageCount ?? 0;
          let doc: PDFDocumentProxy | null = null;

          if (!pageCount) {
            const url = await Promise.resolve(getBookUrl(s.id));
            if (cancelled) return;
            const task = pdfjsLib.getDocument({ url, disableAutoFetch: true, disableStream: true });
            doc = await task.promise;
            if (cancelled) {
              doc.destroy();
              return;
            }
            pageCount = doc.numPages;
          }

          initialSlots.push({
            id: s.id,
            partLabel: s.partLabel,
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
        let firstDoc = initialSlots.find((s) => s.doc)?.doc ?? null;
        if (!firstDoc) {
          const url = await Promise.resolve(getBookUrl(initialSlots[0]!.id));
          if (cancelled) return;
          const task = pdfjsLib.getDocument({ url, disableAutoFetch: true, disableStream: true });
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

        for (const s of initialSlots) {
          if (cancelled) return;
          if (s.doc) {
            s.outline = ((await s.doc.getOutline()) as OutlineNode[]) ?? [];
          }
        }
        if (!cancelled) setSlots([...initialSlots]);
      } catch (e) {
        console.error('[PdfReader] multi-doc load failed:', e);
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMulti]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSlotDoc = useCallback(
    async (slotIndex: number) => {
      const current = slotsRef.current[slotIndex];
      if (!current || current.doc) return current?.doc ?? null;

      const url = await Promise.resolve(getBookUrl(current.id));
      const task = pdfjsLib.getDocument({ url, disableAutoFetch: true, disableStream: true });
      const doc = await task.promise;
      const outline = ((await doc.getOutline()) as OutlineNode[]) ?? [];

      setSlots((prev) => {
        const next = [...prev];
        const slot = next[slotIndex];
        if (slot && !slot.doc) next[slotIndex] = { ...slot, doc, outline };
        return next;
      });
      return doc;
    },
    [getBookUrl],
  );

  useEffect(() => {
    saveZoom(zoom, zoomStorageKey);
  }, [zoom, zoomStorageKey]);

  const scale = useMemo(() => {
    if (!pageSize) return 1;
    return resolveScale(zoom, containerSize.width, containerSize.height, pageSize.width, pageSize.height);
  }, [zoom, pageSize, containerSize]);

  const pageHeight = pageSize ? Math.round(pageSize.height * scale) : 0;

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

  const combinedOutline = useMemo((): TaggedOutlineNode[] => {
    if (slots.length === 1 && slots[0]?.outline.length) return tagNodes(slots[0].outline, 0);
    const nodes: TaggedOutlineNode[] = [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      nodes.push({ title: s.partLabel, dest: null, items: tagNodes(s.outline, i), slotIndex: i });
    }
    return nodes;
  }, [slots]);

  const slotTopOffsetsRef = useRef(slotTopOffsets);
  slotTopOffsetsRef.current = slotTopOffsets;
  const pageHeightRef = useRef(pageHeight);
  pageHeightRef.current = pageHeight;

  // ── Scroll key (derived from props) ──────────────────────────────────────
  const sKey = scrollStorageKey ?? (bookId ? `pdf-reader.scroll.${bookId}` : null);

  const computeCurrentPage = useCallback(
    (scrollTop: number) => {
      if (!pageHeight || slots.length === 0) return 1;
      for (let si = slots.length - 1; si >= 0; si--) {
        const slotTop = slotTopOffsets[si] ?? 0;
        if (scrollTop >= slotTop) {
          const local = Math.floor((scrollTop - slotTop) / (pageHeight + PAGE_GAP));
          return Math.min(slots[si]!.globalPageOffset + local + 1, totalPages);
        }
      }
      return 1;
    },
    [slots, slotTopOffsets, pageHeight, totalPages],
  );

  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setCurrentPage(computeCurrentPage(el.scrollTop));
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => saveScroll(sKey, el.scrollTop), 300);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [computeCurrentPage, sKey]);

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

  const jumpToPage = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el || !pageHeight || slots.length === 0) return;
      const clamped = Math.max(1, Math.min(page, totalPages));
      let targetTop = 0;
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si]!;
        if (clamped <= slot.globalPageOffset + slot.pageCount) {
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
      if (typeof dest === 'string') resolved = await doc.getDestination(dest);
      else if (Array.isArray(dest)) resolved = dest;
      if (!resolved || resolved.length === 0) return null;

      const localPageIndex = await doc.getPageIndex(resolved[0] as { num: number; gen: number });
      return slotTop + localPageIndex * (ph + PAGE_GAP);
    },
    [loadSlotDoc],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
          The file may be corrupted, password-protected, or not a standard PDF.
        </p>
        <p className="max-w-md break-all font-mono text-[10px] text-muted-foreground/60">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to catalog
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
        <button
          type="button"
          onClick={onBack ?? onClose}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Catalog</span>
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
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
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Toggle table of contents"
            onClick={() => setTocOpen((v) => !v)}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
          {ZOOM_PRESETS.map((z) => (
            <button
              key={z.value}
              type="button"
              onClick={() => setZoom(z.value)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                zoom === z.value ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {z.label}
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Zoom out"
            onClick={() => cycleZoom(-1, zoom, setZoom)}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Zoom in"
            onClick={() => cycleZoom(1, zoom, setZoom)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Reset zoom"
            onClick={() => setZoom('fit-width')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* TOC sidebar + page area */}
      <div className="flex min-h-0 flex-1">
        {tocOpen && combinedOutline.length > 0 && (
          <div className="w-64 shrink-0 overflow-auto border-r border-border">
            <div className="p-2">
              <TocTree nodes={combinedOutline} resolveDest={resolveDest} scrollRef={scrollRef} />
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}
