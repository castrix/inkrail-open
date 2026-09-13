import prisma from '../lib/prisma'
import { mangaStreamMetadata } from './manga-stream'

type Source = string
export async function readerManifest(identity: { slug: string } | { sourceSite: Source, sourceNovelId: string, chapter?: string }) {
  const novel = await prisma.novel.findUnique({
    where: 'slug' in identity ? { slug: identity.slug } : { sourceSite_sourceNovelId: { sourceSite: identity.sourceSite, sourceNovelId: identity.sourceNovelId } },
    select: { slug: true, mediaType: true, sourceSite: true, sourceNovelId: true, titleOriginal: true, sourceUrl: true,
      mangaPages: { orderBy: { position: 'asc' }, select: {
        id: true, sourcePageId: true, sourceUrl: true, position: true, imagePath: true, downloadStatus: true, downloadedAt: true, updatedAt: true
      } }
    }
  })
  if ('slug' in identity && (!novel || novel.mediaType !== 'MANGA')) throw createError({ statusCode: 404, statusMessage: 'Manga not found' })
  const sourceSite = ('slug' in identity ? novel!.sourceSite : identity.sourceSite) as Source
  const sourceNovelId = 'slug' in identity ? novel!.sourceNovelId : identity.sourceNovelId
  const base = { slug: novel?.slug, sourceSite, sourceNovelId, defaultReaderMode: 'manga' }
  const metadata = !('slug' in identity) && identity.chapter ? await mangaStreamMetadata(sourceSite, sourceNovelId) : null
  if (novel?.mangaPages.length && !metadata?.mangaChapters?.length) return {
    ...base, titleOriginal: novel.titleOriginal, sourceUrl: novel.sourceUrl,
    pages: novel.mangaPages.map(page => {
      const archived = page.downloadStatus === 'COMPLETED' && Boolean(page.imagePath)
      return { sourcePageId: page.sourcePageId, position: page.position, archived, proxied: !archived,
        imageUrl: archived ? `/api/manga/pages/${page.id}/image?v=${(page.downloadedAt || page.updatedAt).getTime()}`
          : true ? `/api/manga/stream/${sourceSite}/${encodeURIComponent(sourceNovelId)}/${page.position}` : page.sourceUrl }
    })
  }
  const remote = metadata || await mangaStreamMetadata(sourceSite, sourceNovelId)
  const localPages = new Map(novel?.mangaPages.map(page => [page.sourcePageId, page]) || [])
  return { ...base, titleOriginal: remote.titleOriginal, sourceUrl: remote.sourceUrl, mangaChapters: remote.mangaChapters,
    pages: remote.pages.map(page => {
      const local = localPages.get(page.sourcePageId)
      const archived = local?.downloadStatus === 'COMPLETED' && Boolean(local.imagePath)
      return { sourcePageId: page.sourcePageId, position: page.position, archived, proxied: !archived,
        imageUrl: archived && local ? `/api/manga/pages/${local.id}/image?v=${(local.downloadedAt || local.updatedAt).getTime()}` : `/api/manga/stream/${sourceSite}/${encodeURIComponent(sourceNovelId)}/${page.position}` }
    }) }
}
