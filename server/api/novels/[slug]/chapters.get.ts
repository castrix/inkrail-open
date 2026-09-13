import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { cachedNovelDirectory } from '~/server/services/novel-directory'

export default defineEventHandler(async event => {
  const query = z.object({ q: z.string().max(300).default(''), filter: z.enum(['all','ready','untranslated']).default('all'), page: z.coerce.number().int().min(1).max(10000).optional(), selection: z.enum(['waiting']).optional() }).parse(getQuery(event))
  const novel = await prisma.novel.findUnique({ where: { slug: getRouterParam(event, 'slug')! }, select: { id: true, targetLanguage: true, mediaType: true, readingProgress: { select: { chapter: { select: { position: true, sourceChapterId: true } } } }, _count: { select: { chapters: true } } } })
  if (!novel || novel.mediaType !== 'NOVEL') throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  const language = novel.targetLanguage
  const untranslated: Prisma.ChapterWhereInput = { OR: [{ translations: { none: { targetLanguage: language } } }, { translations: { some: { targetLanguage: language, status: { in: ['NOT_STARTED','FAILED','SOURCE_CHANGED'] } } } }] }
  const q = query.q.trim()
  const positionMatches = /^\d+$/.test(q) ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM Chapter WHERE novelId = ${novel.id} AND CAST(position AS TEXT) LIKE ${'%' + q + '%'}`) : []
  const where: Prisma.ChapterWhereInput = { AND: [
    { novelId: novel.id },
    ...(q ? [{ OR: [{ titleOriginal: { contains: q } }, { titleTranslated: { contains: q } }, { sourceChapterId: { contains: q } }, { id: { in: positionMatches.map(x => x.id) } }] }] : []),
    ...(query.filter === 'ready' ? [{ translations: { some: { targetLanguage: language, status: { in: ['TRANSLATED','NEEDS_REVIEW','APPROVED'] } } } }] : query.filter === 'untranslated' ? [untranslated] : [])
  ] }
  const select = { id: true, sourceChapterId: true, position: true, titleOriginal: true, titleTranslated: true, scrapeStatus: true, translations: { where: { targetLanguage: language }, select: { status: true }, take: 1 } } as const
  if (query.selection) {
    const items = await prisma.chapter.findMany({ where: { AND: [where, untranslated, { scrapeStatus: 'COMPLETED' }] }, select: { id: true, scrapeStatus: true, translations: { where: { targetLanguage: language }, select: { status: true }, take: 1 } } })
    return { items, total: items.length }
  }
  const source = cachedNovelDirectory(novel.id)
  const identities = source.length ? await prisma.chapter.findMany({ where: { novelId: novel.id }, select: { sourceChapterId: true } }) : []
  const known = new Set(identities.map(x => x.sourceChapterId))
  const missing = source.filter(x => !known.has(x.sourceChapterId))
  const matchingMissing = query.filter === 'ready' ? [] : missing.filter(x => !q || [x.titleOriginal, x.sourceChapterId, x.position].some(value => String(value).toLocaleLowerCase().includes(q.toLocaleLowerCase())))
  const localTotal = await prisma.chapter.count({ where })
  const total = localTotal + matchingMissing.length, pageSize = 50, pageCount = Math.max(1, Math.ceil(total / pageSize))
  let requestedPage = query.page || 1
  const progress = novel.readingProgress?.chapter
  if (query.page === undefined && !q && query.filter === 'all' && progress) {
    const before = await prisma.chapter.count({ where: { novelId: novel.id, OR: [
      { position: { lt: progress.position } },
      { position: progress.position, sourceChapterId: { lt: progress.sourceChapterId } }
    ] } })
    const remoteBefore = matchingMissing.filter(x => x.position < progress.position || (x.position === progress.position && x.sourceChapterId < progress.sourceChapterId)).length
    requestedPage = Math.floor((before + remoteBefore) / pageSize) + 1
  }
  const page = Math.min(requestedPage, pageCount)
  let items: any[]
  if (!matchingMissing.length) {
    items = await prisma.chapter.findMany({ where, select, orderBy: [{ position: 'asc' }, { sourceChapterId: 'asc' }], skip: (page - 1) * pageSize, take: pageSize })
  } else {
    // Merge only lightweight ordering keys, then fetch the requested local rows.
    const keys = await prisma.chapter.findMany({ where, select: { id: true, sourceChapterId: true, position: true } })
    const window = [...keys, ...matchingMissing.map(x => ({ ...x, id: null }))].sort((a, b) => a.position - b.position || a.sourceChapterId.localeCompare(b.sourceChapterId)).slice((page - 1) * pageSize, page * pageSize)
    const rows = await prisma.chapter.findMany({ where: { id: { in: window.flatMap(x => x.id ? [x.id] : []) } }, select })
    const byId = new Map(rows.map(x => [x.id, x]))
    items = window.map(x => x.id ? byId.get(x.id) : { id: null, sourceChapterId: x.sourceChapterId, position: x.position, titleOriginal: 'titleOriginal' in x ? x.titleOriginal : '', titleTranslated: null, scrapeStatus: 'NOT_DOWNLOADED', translations: [] })
  }
  return { items, total, page, pageCount, pageSize, localCount: novel._count.chapters, directoryCount: novel._count.chapters + missing.length }
})
