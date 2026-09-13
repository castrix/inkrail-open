import prisma from '~/server/lib/prisma'
import { mangaStreamMetadata } from './manga-stream'

type Source = string
export async function readerManifest(identity: { slug: string } | { sourceSite: Source, sourceNovelId: string }) {
  const novel = await prisma.novel.findUnique({
    where: 'slug' in identity ? { slug: identity.slug } : { sourceSite_sourceNovelId: identity },
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
  if (novel?.mangaPages.length) return {
    ...base, titleOriginal: novel.titleOriginal, sourceUrl: novel.sourceUrl,
    pages: novel.mangaPages.map(page => {
      const archived = page.downloadStatus === 'COMPLETED' && Boolean(page.imagePath)
      return { sourcePageId: page.sourcePageId, position: page.position, archived, proxied: !archived,
        imageUrl: archived ? `/api/manga/pages/${page.id}/image?v=${(page.downloadedAt || page.updatedAt).getTime()}`
          : true ? `/api/manga/stream/${sourceSite}/${encodeURIComponent(sourceNovelId)}/${page.position}` : page.sourceUrl }
    })
  }
  const metadata = await mangaStreamMetadata(sourceSite, sourceNovelId)
  return { ...base, titleOriginal: metadata.titleOriginal, sourceUrl: metadata.sourceUrl,
    pages: metadata.pages.map(page => ({ sourcePageId: page.sourcePageId, position: page.position, archived: false, proxied: true,
      imageUrl: true ? `/api/manga/stream/${sourceSite}/${encodeURIComponent(sourceNovelId)}/${page.position}` : page.sourceUrl })) }
}
