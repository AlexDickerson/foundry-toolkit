import { useEffect, useRef, useState } from 'react';
import { COLOR_SCHEMES, type ColorScheme } from '@/_quarantine/lib/usePreferences';
import { api, ApiRequestError } from '@/features/characters/api';

interface Props {
  colorScheme: ColorScheme;
  onColorSchemeChange: (scheme: ColorScheme) => void;
  actorId: string;
  backgroundPath: string | null;
  onBackgroundChanged: () => void;
  onClose: () => void;
}

type UploadState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'uploading'; bytes: number }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

// Sheet-level preferences dialog. Color scheme is client-only; background
// image is per-actor and persisted to the Foundry actor via the
// `character-creator.backgroundImage` flag so every client rendering
// this character sees the same parchment.
export function SettingsDialog({
  colorScheme,
  onColorSchemeChange,
  actorId,
  backgroundPath,
  onBackgroundChanged,
  onClose,
}: Props): React.ReactElement {
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const busy = uploadState.kind === 'reading' || uploadState.kind === 'uploading' || uploadState.kind === 'saving';

  const handleFile = async (file: File): Promise<void> => {
    setUploadState({ kind: 'reading' });
    try {
      const dataBase64 = await fileToBase64(file);
      const ext = extForFile(file);
      // Timestamp-suffix the filename so each upload is a fresh URL
      // and the browser / asset cache can't serve a stale previous
      // version.
      const relPath = `modules/character-creator-bg/${actorId}-${Date.now().toString()}.${ext}`;

      setUploadState({ kind: 'uploading', bytes: file.size });
      const { path: savedPath } = await api.uploadAsset({ path: relPath, dataBase64 });

      setUploadState({ kind: 'saving' });
      await api.updateActor(actorId, {
        flags: { 'character-creator': { backgroundImage: savedPath } },
      });

      onBackgroundChanged();
      setUploadState({ kind: 'idle' });
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.suggestion
            ? `${err.message} — ${err.suggestion}`
            : err.message
          : err instanceof Error
            ? err.message
            : String(err);
      setUploadState({ kind: 'error', message });
    }
  };

  const handleClear = async (): Promise<void> => {
    setUploadState({ kind: 'saving' });
    try {
      await api.updateActor(actorId, {
        flags: { 'character-creator': { backgroundImage: null } },
      });
      onBackgroundChanged();
      setUploadState({ kind: 'idle' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUploadState({ kind: 'error', message });
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[12vh] font-sans"
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

        <div className="flex flex-col gap-5 px-4 py-4">
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">Color Scheme</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_SCHEMES.map((s) => {
                const active = s.id === colorScheme;
                return (
                  // data-color-scheme scopes this button's CSS variables to its
                  // own palette, so the swatch and active-state colours are live
                  // and always correct — no hardcoded hex needed.
                  <button
                    key={s.id}
                    type="button"
                    onClick={(): void => {
                      onColorSchemeChange(s.id);
                    }}
                    aria-pressed={active}
                    data-color-scheme={s.id}
                    className={[
                      'flex items-center gap-2 rounded border px-2.5 py-1.5 text-sm transition-colors',
                      active
                        ? 'border-pf-primary bg-pf-primary/10 text-pf-primary'
                        : 'border-pf-border bg-pf-bg text-pf-text hover:bg-pf-bg-dark/40',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-3.5 w-3.5 rounded-full border border-pf-primary-dark/40"
                      style={{ background: 'var(--color-pf-primary)' }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-pf-alt">Controls the sheet's surface and accent palette. The nav dark mode toggle is independent.</p>
          </section>

          <section className="flex flex-col gap-2 border-t border-pf-border/60 pt-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-pf-alt-dark">Sheet Background</p>
            {backgroundPath && (
              <div className="flex items-center gap-2 rounded border border-pf-border bg-pf-bg p-2">
                <div
                  aria-hidden
                  className="h-10 w-16 rounded border border-pf-border bg-cover bg-center"
                  style={{ backgroundImage: `url(${toAbsoluteUrl(backgroundPath)})` }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-pf-alt" title={backgroundPath}>
                  {backgroundPath}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                data-testid="background-file-input"
                className="hidden"
                onChange={(e): void => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={(): void => {
                  fileInputRef.current?.click();
                }}
                data-testid="background-upload"
                className="rounded border border-pf-primary bg-pf-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-pf-primary-dark disabled:opacity-50"
              >
                {backgroundPath ? 'Replace image…' : 'Upload image…'}
              </button>
              {backgroundPath && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(): void => {
                    void handleClear();
                  }}
                  data-testid="background-clear"
                  className="rounded border border-pf-border bg-pf-bg px-3 py-1.5 text-xs text-pf-text hover:bg-pf-bg-dark disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              {uploadState.kind !== 'idle' && (
                <span
                  className={[
                    'text-[11px]',
                    uploadState.kind === 'error' ? 'text-pf-primary' : 'text-pf-alt',
                  ].join(' ')}
                  role="status"
                >
                  {statusMessage(uploadState)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-pf-alt">
              Stored on the actor via Foundry module flags, so every player viewing this character sees the same
              background.
            </p>
          </section>
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

function statusMessage(state: UploadState): string {
  switch (state.kind) {
    case 'reading':
      return 'Reading file…';
    case 'uploading':
      return `Uploading (${formatBytes(state.bytes)})…`;
    case 'saving':
      return 'Saving to actor…';
    case 'error':
      return state.message;
    case 'idle':
      return '';
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n.toString()} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function extForFile(file: File): string {
  // Prefer the browser-detected MIME-driven extension; fall back to the
  // filename tail. Lowercased and stripped of any query/fragment.
  const fromMime = file.type.split('/')[1];
  if (fromMime && /^[a-z0-9]+$/i.test(fromMime)) return fromMime.toLowerCase();
  const nameTail = file.name.toLowerCase().split('.').pop() ?? '';
  return /^[a-z0-9]+$/.test(nameTail) ? nameTail : 'bin';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string result'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('File read failed'));
    };
    reader.readAsDataURL(file);
  });
}

function toAbsoluteUrl(relativePath: string): string {
  return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
}
