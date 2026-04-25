import { useCallback, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutlineNode, TaggedOutlineNode } from './types';

// Combined TOC sidebar. Each leaf resolves its destination through a
// caller-supplied `resolveDest` so cross-doc navigation in merged-AP
// view picks the right slot's PDF.

export function TocTree({
  nodes,
  resolveDest,
  scrollRef,
}: {
  nodes: TaggedOutlineNode[];
  resolveDest: (dest: string | unknown[] | null, slotIndex: number) => Promise<number | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <ul className="space-y-0.5 text-xs">
      {nodes.map((node, i) => (
        <TocNode key={i} node={node} resolveDest={resolveDest} scrollRef={scrollRef} depth={0} />
      ))}
    </ul>
  );
}

function TocNode({
  node,
  resolveDest,
  scrollRef,
  depth,
}: {
  node: TaggedOutlineNode;
  resolveDest: (dest: string | unknown[] | null, slotIndex: number) => Promise<number | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.items && node.items.length > 0;

  const handleClick = useCallback(async () => {
    if (!scrollRef.current) return;
    const top = await resolveDest(node.dest, node.slotIndex);
    if (top != null) {
      scrollRef.current.scrollTop = top;
    }
  }, [node.dest, node.slotIndex, resolveDest, scrollRef]);

  return (
    <li>
      <div className="flex items-start">
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            'flex-1 truncate py-0.5 text-left transition-colors hover:text-foreground',
            depth === 0 && node.items.length > 0 ? 'font-medium text-foreground/80' : 'text-muted-foreground',
          )}
          style={{ paddingLeft: depth * 8 }}
          title={cleanTocTitle(node.title)}
        >
          {cleanTocTitle(node.title)}
        </button>
      </div>
      {expanded && hasChildren && (
        <ul className="ml-2">
          {node.items.map((child, i) => (
            <TocNode key={i} node={child} resolveDest={resolveDest} scrollRef={scrollRef} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Strip Paizo bookmark noise from TOC titles. Common patterns:
 *    "018-031 PZO90152 Chapter 2" → "Chapter 2"
 *    "032 PZO90152 Appendix" → "Appendix"
 *    "PZO9015-2 Introduction" → "Introduction"
 *  Leading page ranges (\d+-\d+ or \d+), product codes (PZO\w+), and
 *  resulting whitespace are removed. */
function cleanTocTitle(raw: string): string {
  return (
    raw
      .replace(/^\d+(?:-\d+)?\s*/g, '') // leading page range "018-031 " or "032 "
      .replace(/^PZO[\w-]+\s*/gi, '') // product code "PZO90152 "
      .trim() || raw
  ); // fall back to original if nothing remains
}

/** Walk an OutlineNode tree and tag every node with the slot it
 *  belongs to, so the TOC resolver knows which doc to ask for the
 *  destination's page index. */
export function tagNodes(nodes: OutlineNode[], slotIndex: number): TaggedOutlineNode[] {
  return nodes.map((n) => ({
    ...n,
    slotIndex,
    items: tagNodes(n.items ?? [], slotIndex),
  }));
}
