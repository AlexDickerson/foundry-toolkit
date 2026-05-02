import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  /** Tailwind max-width class fragment. Defaults to 'max-w-xl'. */
  maxWidthClass?: string;
  /** When true, applies a width transition class — used by CompendiumPicker
   *  to animate the dialog widening when the split-pane detail opens. */
  animateMaxWidth?: boolean;
  /** Override aria-label. Defaults to `title`. */
  ariaLabel?: string;
  /** Body content rendered as flex children below the header. */
  children: ReactNode;
  /** Optional footer rendered below the body with a top border. Typically
   *  holds Apply / Cancel / Pick action buttons. */
  footer?: ReactNode;
  /** data-testid on the backdrop element. */
  testId?: string;
}

// Shared modal-dialog shell for all picker components.
// Provides: portal to body, dimmed backdrop with click-to-close,
// header with title + close button, Esc-to-close, body scroll lock,
// and an optional bordered footer.
//
// CompendiumPicker, AbilityBoostPicker, and SkillIncreasePicker use this
// to stay visually consistent. QuickActionPicker is a side-panel (different
// layout) and intentionally does not use this shell.
export function PickerDialog({
  title,
  onClose,
  maxWidthClass = 'max-w-xl',
  animateMaxWidth = false,
  ariaLabel,
  children,
  footer,
  testId,
}: Props): React.ReactElement {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return (): void => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      data-testid={testId}
      className="fixed inset-0 z-50 flex items-start justify-center bg-pf-text/50 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className={[
          'flex max-h-[80vh] w-full flex-col rounded border border-pf-border bg-pf-bg shadow-xl',
          animateMaxWidth ? 'transition-[max-width] duration-200 ease-out' : '',
          maxWidthClass,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between border-b border-pf-border px-4 py-2">
          <h2 className="font-serif text-lg font-semibold text-pf-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close picker"
            className="rounded px-2 py-0.5 text-lg text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-primary"
          >
            ×
          </button>
        </header>
        {children}
        {footer != null && (
          <footer className="flex items-center justify-end gap-2 border-t border-pf-border px-4 py-2">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
