import { useEffect, useRef, useState } from 'react';

// "Page N / M" indicator in the toolbar. Click to switch into a
// jump-to-page input mode; press Enter to navigate, Esc / blur to
// cancel.

export function PageIndicator({
  currentPage,
  totalPages,
  isMulti,
  slotCount,
  open,
  onOpenChange,
  onJump,
}: {
  currentPage: number;
  totalPages: number;
  isMulti: boolean;
  slotCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJump: (page: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (open) {
      setInputValue(String(currentPage));
      // Focus after React renders the input.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open, currentPage]);

  const handleSubmit = () => {
    const n = parseInt(inputValue, 10);
    if (Number.isFinite(n)) onJump(n);
    onOpenChange(false);
  };

  if (open) {
    return (
      <span className="flex items-center gap-1 text-[10px]">
        <span className="text-muted-foreground">Page</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onOpenChange(false);
            e.stopPropagation(); // don't trigger reader shortcuts
          }}
          onBlur={handleSubmit}
          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center text-[10px] text-foreground outline-hidden focus:border-primary"
        />
        <span className="text-muted-foreground">/ {totalPages}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenChange(true)}
      className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      title="Click to jump to a page"
    >
      Page {currentPage} / {totalPages}
      {isMulti && ` · ${slotCount} parts`}
    </button>
  );
}
