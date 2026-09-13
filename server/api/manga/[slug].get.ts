import prisma from '~/server/lib/prisma'
import { repairMangaMetadata } from '~/server/services/manga-repair'

export default defineEventHandler(async (event) => {
  const manga = await prisma.novel.findUnique({ where: { slug: getRouterParam(event, 'slug')! }, include: {
    mangaPages: { orderBy: { position: 'asc' }, select: { id: true, position: true, sourcePageId: true, downloadStatus: true, thumbnailUrl: true, downloadedAt: true, updatedAt: true } },
    libraryEntries: { include: { library: true } }
  } })
  if (!manga || manga.mediaType !== 'MANGA') throw createError({ statusCode: 404, statusMessage: 'Manga not found' })
  const repair = repairMangaMetadata(manga)
  if (repair) event.waitUntil(repair)
  let tags: string[] = []
  try { tags = JSON.parse(manga.tagsJson || '[]') } catch { /* Legacy metadata. */ }
  return { ...manga, tags, repairPending: Boolean(repair) }
})
