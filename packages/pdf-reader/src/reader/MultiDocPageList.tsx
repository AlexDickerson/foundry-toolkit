import { useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { PAGE_GAP, SEPARATOR_HEIGHT } from './scroll';
import { PageSlot } from './PageSlot';
import type { DocSlot } from './types';

export function MultiDocPageList({
  slots,
  slotTopOffsets,
  pageHeight,
  pageWidth,
  scale,
  loadSlotDoc,
}: {
  slots: DocSlot[];
  slotTopOffsets: number[];
  pageHeight: number;
  pageWidth: number;
  scale: number;
  loadSlotDoc: (idx: number) => Promise<PDFDocumentProxy | null>;
}) {
  const items = useMemo(() => {
    const list: Array<
      | { kind: 'page'; slotIndex: number; localPageNum: number; top: number }
      | { kind: 'separator'; label: string; top: number }
    > = [];
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!;
      const slotTop = slotTopOffsets[si] ?? 0;
      if (si > 0) {
        list.push({
          kind: 'separator',
          label: slot.partLabel,
          top: slotTop - SEPARATOR_HEIGHT,
        });
      }
      for (let p = 0; p < slot.pageCount; p++) {
        list.push({
          kind: 'page',
          slotIndex: si,
          localPageNum: p + 1,
          top: slotTop + p * (pageHeight + PAGE_GAP),
        });
      }
    }
    return list;
  }, [slots, slotTopOffsets, pageHeight]);

  const lastItem = items[items.length - 1];
  const totalHeight = lastItem ? lastItem.top + (lastItem.kind === 'page' ? pageHeight : SEPARATOR_HEIGHT) : 0;

  return (
    <div
      style={{
        position: 'relative',
        width: pageWidth,
        height: totalHeight,
        margin: '0 auto',
        paddingTop: PAGE_GAP,
      }}
    >
      {items.map((item, i) =>
        item.kind === 'separator' ? (
          <div
            key={`sep-${i}`}
            style={{
              position: 'absolute',
              top: item.top,
              left: 0,
              width: pageWidth,
              height: SEPARATOR_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="h-px w-12 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              <div className="h-px w-12 bg-border" />
            </div>
          </div>
        ) : (
          <PageSlot
            key={`${item.slotIndex}-${item.localPageNum}`}
            slots={slots}
            slotIndex={item.slotIndex}
            localPageNum={item.localPageNum}
            width={pageWidth}
            height={pageHeight}
            scale={scale}
            top={item.top}
            loadSlotDoc={loadSlotDoc}
          />
        ),
      )}
    </div>
  );
}
