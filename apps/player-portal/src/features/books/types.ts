/** Shape of entries returned by GET /books/_index.json from foundry-mcp.
 *  When the books table in pf2e.db is available, AI-classified metadata
 *  (system, aiCategory, subcategory, publisher) is merged in. */
export interface BookIndexEntry {
  id: string;
  filename: string;
  title: string;
  sizeBytes: number;
  mtime: number;
  category?: string;
  system?: string;
  aiCategory?: string;
  subcategory?: string;
  publisher?: string;
  pageCount?: number;
}
