import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '~/server/lib/prisma'

const translatedStatuses = ['TRANSLATED', 'NEEDS_REVIEW', 'APPROVED']
const tagsOf = (json: string | null): string[] => { try { const tags = JSON.parse(json || '[]'); return Array.isArray(tags) ? tags.filter(x => typeof x === 'string') : [] } catch { return [] } }

export default defineEventHandler(async (event) => {
  const query = z.object({
    libraryId: z.string().optional(), q: z.string().max(300).default(''),
    media: z.enum(['all', 'NOVEL', 'MANGA']).default('all'), author: z.string().default(''),
    language: z.string().default(''), tag: z.string().default(''),
    limit: z.coerce.number().int().min(1).max(80).default(40), cursor: z.string().optional(),
    summary: z.enum(['0', '1']).default('1')
  }).parse(getQuery(event))
  const scope: Prisma.NovelWhereInput = query.libraryId
    ? { libraryEntries: { some: { libraryId: query.libraryId } } }
    : { libraryEntries: { some: {} }, contentRating: { not: 'ADULT' } }
  const where: Prisma.NovelWhereInput = { AND: [scope,
    ...(query.q.trim() ? [{ OR: ['titleOriginal', 'titleTranslated', 'author'].map(field => ({ [field]: { contains: query.q.trim() } })) }] : []),
    ...(query.media !== 'all' ? [{ mediaType: query.media }] : []),
    ...(query.author ? [{ mediaType: 'MANGA', author: query.author }] : []),
    ...(query.language ? [{ mediaType: 'MANGA', sourceLanguage: query.language }] : []),
    ...(query.tag ? [{ mediaType: 'MANGA', tagsJson: { contains: JSON.stringify(query.tag) } }] : [])
  ] }
  let after: Prisma.NovelWhereInput = {}
  if (query.cursor) {
    try {
      const cursor = z.object({ id: z.string(), updatedAt: z.string().datetime() }).parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()))
      const date = new Date(cursor.updatedAt)
      after = { OR: [{ updatedAt: { lt: date } }, { updatedAt: date, id: { lt: cursor.id } }] }
    } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid library cursor' }) }
  }
  const rows = await prisma.novel.findMany({
    where: { AND: [where, after] }, take: query.limit + 1, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, slug: true, titleOriginal: true, titleTranslated: true, author: true, category: true,
      sourceStatus: true, mediaType: true, contentRating: true, sourceLanguage: true, tagsJson: true,
      coverPath: true, coverUrl: true, updatedAt: true,
      _count: { select: { chapters: true, mangaPages: true } },
      libraryEntries: { select: { library: { select: { id: true, name: true } } } }
    }
  })
  const hasMore = rows.length > query.limit
  const page = rows.slice(0, query.limit), ids = page.map(row => row.id)
  const [downloads, scraped, translations] = ids.length ? await Promise.all([
    prisma.mangaPage.groupBy({ by: ['novelId'], where: { novelId: { in: ids }, downloadStatus: 'COMPLETED' }, _count: true }),
    prisma.chapter.groupBy({ by: ['novelId'], where: { novelId: { in: ids }, scrapeStatus: 'COMPLETED' }, _count: true }),
    prisma.$queryRaw<Array<{ novelId: string, count: bigint }>>(Prisma.sql`SELECT c.novelId, COUNT(*) AS count FROM Translation t JOIN Chapter c ON c.id = t.chapterId WHERE c.novelId IN (${Prisma.join(ids)}) AND t.status IN (${Prisma.join(translatedStatuses)}) GROUP BY c.novelId`)
  ]) : [[], [], []]
  const downloadedMap = new Map(downloads.map(x => [x.novelId, x._count]))
  const scrapedMap = new Map(scraped.map(x => [x.novelId, x._count]))
  const translatedMap = new Map(translations.map(x => [x.novelId, Number(x.count)]))
  const items = page.map(({ tagsJson, coverPath, _count, libraryEntries, updatedAt, ...row }) => ({
    ...row, tags: tagsOf(tagsJson), chapterCount: row.mediaType === 'MANGA' ? _count.mangaPages : _count.chapters,
    scrapedCount: scrapedMap.get(row.id) || 0, downloadedPageCount: downloadedMap.get(row.id) || 0,
    translatedCount: translatedMap.get(row.id) || 0,
    coverUrl: coverPath ? `/api/novels/${row.id}/cover?v=${updatedAt.getTime()}` : row.coverUrl,
    libraries: libraryEntries.map(x => x.library)
  }))
  const last = page.at(-1)
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ id: last.id, updatedAt: last.updatedAt.toISOString() })).toString('base64url') : null
  if (query.summary === '0') return { items, hasMore, nextCursor }
  const [total, allCount, chapters, mangaPages, translated, facets] = await Promise.all([
    prisma.novel.count({ where }), prisma.novel.count({ where: { libraryEntries: { some: {} }, contentRating: { not: 'ADULT' } } }),
    prisma.chapter.count({ where: { novel: { AND: [where, { mediaType: 'NOVEL' }] } } }),
    prisma.mangaPage.count({ where: { novel: { AND: [where, { mediaType: 'MANGA' }] } } }),
    prisma.translation.count({ where: { status: { in: translatedStatuses }, chapter: { novel: where } } }),
    prisma.novel.findMany({ where: { AND: [scope, { mediaType: 'MANGA' }] }, select: { author: true, sourceLanguage: true, tagsJson: true } })
  ])
  return { items, hasMore, nextCursor, total, allCount, totalChapters: chapters + mangaPages, translatedChapters: translated,
    facets: { authors: [...new Set(facets.map(x => x.author).filter(Boolean))].sort(), languages: [...new Set(facets.map(x => x.sourceLanguage))].sort(), tags: [...new Set(facets.flatMap(x => tagsOf(x.tagsJson)))].sort() } }
})
