/** Shape of entries returned by GET /books/_index.json from foundry-mcp. */
export interface BookIndexEntry {
  id: string;
  filename: string;
  title: string;
  sizeBytes: number;
  mtime: number;
  category?: string;
}
