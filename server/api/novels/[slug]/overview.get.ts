import prisma from '~/server/lib/prisma'
export default defineEventHandler(async event => {
  const novel = await prisma.novel.findUnique({ where: { slug: getRouterParam(event, 'slug')! }, select: {
    id: true, slug: true, mediaType: true, titleOriginal: true, titleTranslated: true, author: true, category: true,
    wordCountLabel: true, sourceStatus: true, sourceLanguage: true, sourceNovelId: true, description: true,
    readingProgress: { select: { chapterId: true, chapter: { select: { position: true } } } },
    libraryEntries: { select: { library: { select: { id: true, name: true } } } }, syncSchedule: true,
    _count: { select: { chapters: true } }
  } })
  if (!novel || novel.mediaType !== 'NOVEL') throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  const through = novel.readingProgress?.chapter.position || 0
  const [firstChapter, counts] = await Promise.all([
    prisma.chapter.findFirst({ where: { novelId: novel.id, scrapeStatus: 'COMPLETED' }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } }),
    prisma.encyclopediaEntry.groupBy({ by: ['type'], where: { novelId: novel.id, firstPosition: { lte: through } }, _count: true })
  ])
  return { ...novel, firstChapter, chapterCount: novel._count.chapters, dictionaryCounts: Object.fromEntries(counts.map(x => [x.type, x._count])) }
})
