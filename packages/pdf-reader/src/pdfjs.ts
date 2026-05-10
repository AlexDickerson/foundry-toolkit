// pdfjs-dist re-export. Call configurePdfWorker(workerUrl) once at app startup
// before rendering any PdfReader. The workerUrl is typically obtained with a
// Vite `?url` import at the app's bundle boundary (so the URL is resolved by
// Vite, not the shared package).
//
// Example (in your app's entry or lib/pdfjs.ts):
//   import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
//   import { configurePdfWorker } from '@foundry-toolkit/pdf-reader';
//   configurePdfWorker(pdfjsWorkerUrl);

import * as pdfjsLib from 'pdfjs-dist';

export { pdfjsLib };

export function configurePdfWorker(workerUrl: string): void {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}
