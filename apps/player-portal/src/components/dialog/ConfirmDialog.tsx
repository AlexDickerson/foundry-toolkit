import { useEffect } from 'react';

interface Props {
  message: string;
  /** Label for the primary confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Styled in-app confirmation dialog. Replaces `window.confirm()` so the
 * prompt stays inside the app's visual theme rather than spawning a native
 * browser dialog with a visible URL bar.
 *
 * Clicking the overlay backdrop or pressing Escape cancels.
 */
export function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: Props): React.ReactElement {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return (): void => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="confirm-dialog-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded border border-pf-border bg-pf-bg shadow-2xl"
        data-testid="confirm-dialog-panel"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <div className="px-5 py-4">
          <p className="text-sm text-pf-text" data-testid="confirm-dialog-message">
            {message}
          </p>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-pf-border bg-pf-bg-dark/60 px-4 py-2.5">
          <button
            type="button"
            onClick={onCancel}
            data-testid="confirm-dialog-cancel"
            className="rounded border border-pf-border bg-pf-bg px-3 py-1.5 text-sm text-pf-text hover:bg-pf-bg-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
            className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-pf-primary-dark"
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
