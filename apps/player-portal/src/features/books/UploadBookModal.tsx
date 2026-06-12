import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { uploadBook, type UploadBookResult } from './api';

interface Props {
  existingCategories: string[];
  onClose: () => void;
  onSuccess: (result: UploadBookResult) => void;
}

async function extractPdfCover(file: File): Promise<{ coverBlob: Blob; numPages: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(300 / viewport.width, 1);
  const scaled = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scaled.width);
  canvas.height = Math.round(scaled.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Cover extraction failed'));
        return;
      }
      resolve({ coverBlob: blob, numPages });
    }, 'image/png');
  });
}

export function UploadBookModal({ existingCategories, onClose, onSuccess }: Props): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('Uncategorized');
  const [customCategory, setCustomCategory] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [subcategory, setSubcategory] = useState('');
  const [title, setTitle] = useState('');
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Cleanup object URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFilePick = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setTitle(picked.name.replace(/\.pdf$/i, '').replace(/_/g, ' '));
    setError(null);
    setExtracting(true);
    try {
      const { coverBlob: blob, numPages } = await extractPdfCover(picked);
      setCoverBlob(blob);
      setPageCount(numPages);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.warn('[UploadBookModal] cover extraction failed:', err);
    } finally {
      setExtracting(false);
    }
  }, []);

  const effectiveCategory = useCustom ? customCategory : category;

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('category', effectiveCategory || 'Uncategorized');
      if (subcategory.trim()) fd.append('subcategory', subcategory.trim());
      fd.append('title', title.trim() || file.name.replace(/\.pdf$/i, ''));
      if (pageCount != null) fd.append('pageCount', String(pageCount));
      fd.append('file', file, file.name);
      if (coverBlob) fd.append('cover', coverBlob, 'cover.png');
      const result = await uploadBook(fd, setProgress);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }, [file, effectiveCategory, subcategory, title, pageCount, coverBlob, onSuccess]);

  const uniqueCategories = [...new Set(['Uncategorized', ...existingCategories])].sort();

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
      onClick={onClose}
      data-testid="upload-book-backdrop"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded border border-portal-border bg-portal-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-portal-border px-4 py-3">
          <h2 className="text-base font-semibold text-portal-text">Upload PDF</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-portal-text-muted hover:text-portal-text"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-1">PDF file *</label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFilePick}
              className="w-full text-sm text-portal-text file:mr-3 file:rounded file:border file:border-portal-border file:bg-transparent file:px-2 file:py-1 file:text-sm file:text-portal-text"
              data-testid="file-input"
            />
          </div>

          {/* Cover preview */}
          {(extracting || previewUrl) && (
            <div className="flex items-center gap-3">
              {extracting && <span className="text-sm text-portal-text-muted">Extracting cover…</span>}
              {previewUrl && !extracting && (
                <img src={previewUrl} alt="Cover preview" className="h-24 rounded border border-portal-border object-contain" />
              )}
              {pageCount != null && !extracting && (
                <span className="text-sm text-portal-text-muted">{pageCount} pages</span>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-portal-border bg-transparent px-3 py-1.5 text-sm text-portal-text focus:outline-none focus:ring-1 focus:ring-portal-border"
              placeholder="Derived from filename"
              data-testid="title-input"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-1">Category</label>
            {!useCustom ? (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 rounded border border-portal-border bg-portal-bg px-3 py-1.5 text-sm text-portal-text focus:outline-none"
                  data-testid="category-select"
                >
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustom(true)}
                  className="rounded border border-portal-border px-2 py-1 text-sm text-portal-text-muted hover:text-portal-text"
                >
                  New…
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Type new category"
                  className="flex-1 rounded border border-portal-border bg-transparent px-3 py-1.5 text-sm text-portal-text focus:outline-none focus:ring-1 focus:ring-portal-border"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  data-testid="custom-category-input"
                />
                <button
                  type="button"
                  onClick={() => setUseCustom(false)}
                  className="rounded border border-portal-border px-2 py-1 text-sm text-portal-text-muted hover:text-portal-text"
                >
                  ↩
                </button>
              </div>
            )}
          </div>

          {/* Subcategory */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-1">
              Subcategory <span className="text-portal-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="w-full rounded border border-portal-border bg-transparent px-3 py-1.5 text-sm text-portal-text focus:outline-none focus:ring-1 focus:ring-portal-border"
              placeholder="e.g. Rulebook, Adventure Path"
              data-testid="subcategory-input"
            />
          </div>

          {/* Progress bar */}
          {uploading && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-portal-text-muted">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-portal-border">
                <div className="h-full rounded-full bg-portal-text transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t border-portal-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded border border-portal-border px-3 py-1.5 text-sm text-portal-text-muted hover:text-portal-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading || extracting}
            className="rounded border border-portal-border bg-portal-text px-3 py-1.5 text-sm text-portal-bg hover:opacity-90 disabled:opacity-40"
            data-testid="upload-button"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
