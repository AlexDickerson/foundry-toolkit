import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '@/lib/pdfjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type { DocSlot } from './types';

// Renders one PDF page into a canvas + text layer. Lazy: only fetches
// the doc and renders the page when the slot scrolls into view (1-page
// rootMargin). On scroll-out the canvas + text layer are cleared so
// memory doesn't grow unbounded as the user pages through a long PDF.

export function PageSlot({
  slots,
  slotIndex,
  localPageNum,
  width,
  height,
  scale,
  top,
  loadSlotDoc,
}: {
  slots: DocSlot[];
  slotIndex: number;
  localPageNum: number;
  width: number;
  height: number;
  scale: number;
  top: number;
  loadSlotDoc: (idx: number) => Promise<PDFDocumentProxy | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const renderingRef = useRef(false);
  const renderedScaleRef = useRef<number | null>(null);

  const doc = slots[slotIndex]?.doc ?? null;

  // IntersectionObserver with 1-page margin.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry!.isIntersecting), {
      rootMargin: `${height}px 0px ${height}px 0px`,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [height]);

  // Trigger lazy doc loading when this page becomes visible.
  useEffect(() => {
    if (visible && !doc) {
      loadSlotDoc(slotIndex).catch(console.error);
    }
  }, [visible, doc, slotIndex, loadSlotDoc]);

  // Render when visible + doc loaded + scale changed.
  useEffect(() => {
    if (!visible || !doc) return;
    if (renderingRef.current) return;
    if (renderedScaleRef.current === scale) return;

    let cancelled = false;
    renderingRef.current = true;

    (async () => {
      try {
        const page = await doc.getPage(localPageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        renderedScaleRef.current = scale;

        const textDiv = textLayerRef.current;
        if (!textDiv || cancelled) return;
        textDiv.innerHTML = '';
        // pdfjs TextLayer uses the CSS variable --scale-factor to compute
        // span transforms. Without it, the text spans drift from the canvas.
        // See: https://github.com/mozilla/pdf.js/discussions/18068
        textDiv.style.setProperty('--scale-factor', String(scale));
        textDiv.style.width = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;

        const { TextLayer } = pdfjsLib;
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textDiv,
          viewport,
        });
        await textLayer.render();
      } catch (e) {
        if (!cancelled) console.error(`Page render error:`, e);
      } finally {
        renderingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, scale, doc, localPageNum]);

  // Cleanup on scroll-out.
  useEffect(() => {
    if (visible) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
    const textDiv = textLayerRef.current;
    if (textDiv) textDiv.innerHTML = '';
    renderedScaleRef.current = null;
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top,
        left: 0,
        width,
        height,
        background: doc ? 'white' : undefined,
        boxShadow: doc ? '0 1px 4px rgba(0,0,0,0.15)' : undefined,
      }}
    >
      {doc ? (
        <>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
          <div ref={textLayerRef} className="textLayer" />
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
      )}
    </div>
  );
}
