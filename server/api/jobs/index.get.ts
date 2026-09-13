import { z } from 'zod'
import prisma from '~/server/lib/prisma'

const CATEGORY_TYPES = {
  translation: ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES', 'RECONCILE_DICTIONARY'],
  novel: ['SCRAPE_CHAPTERS'],
  manga: ['DOWNLOAD_MANGA'],
  image: ['GENERATE_CHARACTER_IMAGE', 'DETECT_CHARACTER_SKINS']
} as const

const isWorking = (status: string, updatedAt: Date) => ['RUNNING', 'CANCEL_REQUESTED'].includes(status) && updatedAt.getTime() >= Date.now() - 30_000
const statusPriority = (status: string, updatedAt: Date) => {
  if (isWorking(status, updatedAt)) return 0
  if (status === 'WAITING_FOR_ACCESS' || ['RUNNING', 'CANCEL_REQUESTED'].includes(status)) return 1
  if (status === 'PENDING') return 2
  if (['FAILED', 'PARTIAL', 'RATE_LIMITED', 'PAUSED'].includes(status)) return 3
  return 4
}

export default defineEventHandler(async (event) => {
  const query = z.object({
    category: z.enum(['translation', 'novel', 'manga', 'image']).default('translation'),
    limit: z.coerce.number().int().min(20).max(100_000).default(100)
  }).parse(getQuery(event))
  const [all, groupedCounts] = await Promise.all([
    prisma.scrapeJob.findMany({
      where: { type: { in: [...CATEGORY_TYPES[query.category]] } },
      include: { novel: { select: { titleOriginal: true, slug: true, mediaType: true } } }
    }),
    prisma.scrapeJob.groupBy({ by: ['type'], _count: { _all: true } })
  ])
  all.sort((left, right) => statusPriority(left.status, left.updatedAt) - statusPriority(right.status, right.updatedAt)
    || (left.status === 'PENDING' && right.status === 'PENDING' ? right.priority - left.priority : 0)
    || left.createdAt.getTime() - right.createdAt.getTime())
  const items = all.slice(0, query.limit)
  const translationChapterIds = items.filter(job => ['TRANSLATE_CHAPTER', 'REPAIR_TRANSLATION', 'EXTRACT_ENTITIES'].includes(job.type) && job.payload).map(job => job.payload!)
  const chapterTitles = new Map((await prisma.chapter.findMany({
    where: { id: { in: translationChapterIds } },
    select: { id: true, position: true, titleOriginal: true, titleTranslated: true }
  })).map(chapter => [chapter.id, chapter]))
  const countsByType = new Map(groupedCounts.map(item => [item.type, item._count._all]))
  return {
    items: items.map(job => ({ ...job, isWorking: isWorking(job.status, job.updatedAt), chapter: job.payload ? chapterTitles.get(job.payload) || null : null })),
    total: all.length,
    hasMore: items.length < all.length,
    counts: {
      translation: (countsByType.get('TRANSLATE_CHAPTER') || 0) + (countsByType.get('REPAIR_TRANSLATION') || 0) + (countsByType.get('EXTRACT_ENTITIES') || 0) + (countsByType.get('RECONCILE_DICTIONARY') || 0),
      novel: countsByType.get('SCRAPE_CHAPTERS') || 0,
      manga: countsByType.get('DOWNLOAD_MANGA') || 0,
      image: (countsByType.get('GENERATE_CHARACTER_IMAGE') || 0) + (countsByType.get('DETECT_CHARACTER_SKINS') || 0)
    }
  }
})
