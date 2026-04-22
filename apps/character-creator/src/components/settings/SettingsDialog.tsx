import { useEffect } from 'react';
import { COLOR_SCHEMES, type ColorScheme } from '../../lib/usePreferences';

interface Props {
  colorScheme: ColorScheme;
  onColorSchemeChange: (scheme: ColorScheme) => void;
  onClose: () => void;
}

// Small preferences dialog rendered above the character sheet. Currently
// only exposes the color scheme picker; grows as more sheet-level prefs
// land (font size, compact mode, etc.).
export function SettingsDialog({ colorScheme, onColorSchemeChange, onClose }: Props): React.ReactElement {
  // Lock background scrolling + wire Esc-to-close, matching the pattern
  // used by PromptModal for consistency.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[15vh] font-sans"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      data-testid="settings-dialog"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded border border-pf-border bg-pf-bg shadow-2xl"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-pf-border bg-pf-bg-dark/60 px-4 py-3">
          <h2 className="text-base font-semibold text-pf-text">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded px-2 py-1 text-sm text-pf-alt-dark hover:bg-pf-bg-dark hover:text-pf-text"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">Color Scheme</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_SCHEMES.map((s) => {
                const active = s.id === colorScheme;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={(): void => {
                      onColorSchemeChange(s.id);
                    }}
                    aria-pressed={active}
                    data-scheme={s.id}
                    className={[
                      'flex items-center gap-2 rounded border px-2.5 py-1.5 text-sm transition-colors',
                      active
                        ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                        : 'border-pf-border bg-white text-pf-text hover:bg-pf-bg-dark/40',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-3.5 w-3.5 rounded-full border border-pf-border"
                      style={{ background: s.swatch }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-pf-alt">Recolors the primary/secondary/tertiary palette used across the sheet.</p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-pf-border bg-pf-bg-dark/60 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-pf-primary-dark"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
