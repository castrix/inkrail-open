import prisma from '~/server/lib/prisma'

export default defineEventHandler(async () => {
  const heartbeatCutoff = new Date(Date.now() - 30_000)
  const where = { OR: [
      { status: { in: ['WAITING_FOR_ACCESS', 'PENDING', 'PAUSED'] } },
      { status: { in: ['RUNNING', 'CANCEL_REQUESTED'] }, updatedAt: { gte: heartbeatCutoff } }
    ] }
  const include = { novel: { select: { titleOriginal: true, slug: true, mediaType: true } } } as const
  const [active, queued, paused, groups] = await Promise.all([
    prisma.scrapeJob.findMany({ where: { AND: [where, { status: { notIn: ['PENDING', 'PAUSED'] } }] }, include, take: 30, orderBy: { startedAt: 'asc' } }),
    prisma.scrapeJob.findMany({ where: { status: 'PENDING' }, include, take: 10, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
    prisma.scrapeJob.findMany({ where: { status: 'PAUSED' }, include, take: 10, orderBy: { createdAt: 'asc' } }),
    prisma.scrapeJob.groupBy({ by: ['status', 'type'], where, _count: { _all: true } })
  ])
  const jobs = [...active, ...paused, ...queued]
  const count = (statuses: string[], types?: string[]) => groups.filter(group => statuses.includes(group.status) && (!types || types.includes(group.type))).reduce((sum, group) => sum + group._count._all, 0)
  const translationChapterIds = jobs.filter(job => ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES'].includes(job.type) && job.payload).map(job => job.payload!)
  const chapterTitles = new Map((await prisma.chapter.findMany({
    where: { id: { in: translationChapterIds } },
    select: { id: true, position: true, titleOriginal: true, titleTranslated: true }
  })).map(chapter => [chapter.id, chapter]))
  const items = jobs.map(job => ({ ...job, chapter: job.payload ? chapterTitles.get(job.payload) || null : null }))
  return {
    items,
    queued: count(['PENDING']),
    blocked: count(['PAUSED', 'WAITING_FOR_ACCESS']),
    total: groups.reduce((sum, group) => sum + group._count._all, 0),
    translationEnabled: process.env.INKRAIL_ENABLE_TRANSLATION === 'true',
    counts: {
      translation: count(['RUNNING', 'CANCEL_REQUESTED'], ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES', 'RECONCILE_DICTIONARY']),
      novel: count(['RUNNING', 'CANCEL_REQUESTED'], ['SCRAPE_CHAPTERS']),
      manga: count(['RUNNING', 'CANCEL_REQUESTED'], ['DOWNLOAD_MANGA']),
      image: count(['RUNNING', 'CANCEL_REQUESTED'], ['GENERATE_CHARACTER_IMAGE', 'DETECT_CHARACTER_SKINS'])
    }
  }
})
