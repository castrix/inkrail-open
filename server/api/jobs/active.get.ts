import prisma from '~/server/lib/prisma'

export default defineEventHandler(async () => {
  const heartbeatCutoff = new Date(Date.now() - 30_000)
  const jobs = await prisma.scrapeJob.findMany({
    where: { OR: [
      { status: 'WAITING_FOR_ACCESS' },
      { status: { in: ['RUNNING', 'CANCEL_REQUESTED'] }, updatedAt: { gte: heartbeatCutoff } }
    ] },
    orderBy: { startedAt: 'asc' },
    include: { novel: { select: { titleOriginal: true, slug: true, mediaType: true } } }
  })
  const translationChapterIds = jobs.filter(job => ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES'].includes(job.type) && job.payload).map(job => job.payload!)
  const chapterTitles = new Map((await prisma.chapter.findMany({
    where: { id: { in: translationChapterIds } },
    select: { id: true, position: true, titleOriginal: true, titleTranslated: true }
  })).map(chapter => [chapter.id, chapter]))
  const items = jobs.map(job => ({ ...job, chapter: job.payload ? chapterTitles.get(job.payload) || null : null }))
  return {
    items,
    counts: {
      translation: items.filter(job => ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES', 'RECONCILE_DICTIONARY'].includes(job.type)).length,
      novel: items.filter(job => job.type === 'SCRAPE_CHAPTERS').length,
      manga: items.filter(job => job.type === 'DOWNLOAD_MANGA').length
      ,image: items.filter(job => ['GENERATE_CHARACTER_IMAGE', 'DETECT_CHARACTER_SKINS'].includes(job.type)).length
    }
  }
})
