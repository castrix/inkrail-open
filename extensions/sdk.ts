/** Inkrail protocol v1. Package source code is compiled to a single ESM entry before publishing. */
export interface SourceContext { config: Record<string, string>; signal: AbortSignal; dataDir: string }
export interface SourceItem { sourceNovelId: string; sourceUrl: string; indexUrl: string; titleOriginal: string; author?: string | null; description?: string | null; coverUrl?: string | null; sourceUpdatedAt?: string | null }
export interface Page { sourcePageId: string; position: number; sourceUrl: string; thumbnailUrl: string }
export interface Chapter { sourceChapterId: string; sourceUrl: string; position: number; titleOriginal: string; kind: 'MAIN' | 'EXTRA' | 'ANNOUNCEMENT' | 'UNKNOWN' }
export interface Source {
  metadata(params: { id: string; forceRefresh?: boolean }, context: SourceContext): Promise<SourceItem & { pages?: Page[]; tags?: string[]; language?: string }>;
  search?(params: { query: string; page: number; [filter: string]: unknown }, context: SourceContext): Promise<{ results: SourceItem[]; hasNext: boolean }>;
  browse?: Source['search'];
  chapters?(params: { id: string }, context: SourceContext): Promise<{ chapters: Chapter[]; complete: boolean; expectedCount: number | null }>;
  chapter?(params: { id: string; bookId: string; url: string }, context: SourceContext): Promise<{ titleOriginal: string; paragraphs: string[]; publishedAt: string | null }>;
  pages?(params: { id: string }, context: SourceContext): Promise<Page[]>;
  asset?(params: { url: string; referer?: string }, context: SourceContext): Promise<{ base64: string }>;
  resolve?(params: { url: string }, context: SourceContext): Promise<{ id: string }>;
  browser?(params: { action: 'open' | 'status' }, context: SourceContext): Promise<unknown>;
  health?(): Promise<void>;
}
