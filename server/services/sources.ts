import { parseMangaChapters } from '~/shared/utils/manga-chapters'
import prisma from '~/server/lib/prisma'
import { z } from 'zod'
import { invokeSource, sourceManifest } from './extensions'
import type { MangaMetadata, NovelMetadata, ParsedIndex } from '~/shared/scraper/types'
const ref = z.string().min(1).max(500)
const url = z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol))
const nullable = z.string().nullable().default(null)
const pageSchema = z.object({ sourcePageId: ref, sourceUrl: url, thumbnailUrl: url, position: z.number().int().positive() })
const metadataSchema = z.object({ sourceNovelId: ref, sourceUrl: url, indexUrl: url, titleOriginal: z.string().min(1), author: nullable, category: nullable, wordCountLabel: nullable, sourceStatus: nullable, description: nullable, coverUrl: url.nullable().default(null), sourceUpdatedAt: z.coerce.date().nullable().default(null) })
export async function fetchSourceMetadata(source: string, id: string, options = {}): Promise<MangaMetadata> {
  const manifest = await sourceManifest(source)
  const raw = await invokeSource(source, 'metadata', { id, ...options })
  const metadata = metadataSchema.parse(raw)
  if (metadata.sourceNovelId !== id) throw new Error('Source returned a different item ID')
  const pages = manifest.mediaType === 'MANGA' ? z.array(pageSchema).parse(raw.pages || await invokeSource(source, 'pages', { id })) : []
  if (new Set(pages.map(p => p.sourcePageId)).size !== pages.length || new Set(pages.map(p => p.position)).size !== pages.length) throw new Error('Duplicate manga pages')
  return { ...metadata, sourceSite: source, pages, mangaChapters: manifest.mediaType === 'MANGA' ? parseMangaChapters(raw.mangaChapters, pages) : undefined, tags: z.array(z.string()).parse(raw.tags || []), language: raw.language || manifest.sourceLanguage, publisher: raw.publisher || null, favoriteCount: raw.favoriteCount || null }
}
export async function fetchSourceDirectory(source: string, id: string): Promise<{ parsed: ParsedIndex, transport: string }> {
  const parsed = z.object({ chapters: z.array(z.object({ sourceChapterId: ref, sourceUrl: url, position: z.number().int().positive(), titleOriginal: z.string(), kind: z.enum(['MAIN','EXTRA','ANNOUNCEMENT','UNKNOWN']) })), complete: z.boolean(), expectedCount: z.number().nullable() }).parse(await invokeSource(source, 'chapters', { id }))
  if (!parsed.complete) throw new Error('Source returned an incomplete chapter directory')
  if (new Set(parsed.chapters.map(c => c.sourceChapterId)).size !== parsed.chapters.length) throw new Error('Duplicate chapter IDs')
  return { parsed, transport: 'extension' }
}
export async function sourceDetails(source: string, id: string) {
  const [manifest, metadata, localNovel] = await Promise.all([sourceManifest(source), fetchSourceMetadata(source, id), prisma.novel.findUnique({ where: { sourceSite_sourceNovelId: { sourceSite: source, sourceNovelId: id } }, include: { libraryEntries: { include: { library: true } }, chapters: true, mangaPages: true } })])
  const chapters = manifest.mediaType === 'NOVEL' ? (await fetchSourceDirectory(source, id)).parsed.chapters : []
  return { ...metadata, mediaType: manifest.mediaType, contentRating: manifest.contentRating,
    chapters: chapters.map(chapter => ({ ...chapter, local: localNovel?.chapters.find(c => c.sourceChapterId === chapter.sourceChapterId) || null })),
    pages: metadata.pages.map(page => ({ ...page, local: localNovel?.mangaPages.find(p => p.sourcePageId === page.sourcePageId) || null })),
    localNovel: localNovel ? { id: localNovel.id, slug: localNovel.slug, libraries: localNovel.libraryEntries.map(e => e.library) } : null }
}
// Compatibility helpers for stored jobs and imports; all website logic is external.
export const fetchTwkanMetadata = (id: string) => fetchSourceMetadata('twkan', id)
export const fetchTwkanDirectory = (id: string, _url?: string) => fetchSourceDirectory('twkan', id)
export const fetchHentaiNexusMetadata = (id: string) => fetchSourceMetadata('hentainexus', id)
export const fetchNhentaiMetadata = (id: string) => fetchSourceMetadata('nhentai', id)
export const fetchHitomiMetadata = (id: string, options = {}) => fetchSourceMetadata('hitomi', id, options)
