import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const job = await prisma.scrapeJob.findUnique({ where: { id } })
  if (!job || !['WAITING_FOR_ACCESS', 'FAILED', 'PARTIAL'].includes(job.status)) {
    throw createError({ statusCode: 400, statusMessage: 'This job cannot be resumed' })
  }
  let selectedIds: string[] | null = null
  try {
    const payload = job.payload ? JSON.parse(job.payload) : null
    selectedIds = Array.isArray(payload?.chapterIds) ? payload.chapterIds.filter((id: unknown): id is string => typeof id === 'string') : null
  } catch { /* Legacy jobs apply to the whole novel. */ }
  const progress = job.type === 'SCRAPE_CHAPTERS' && job.novelId
    ? await prisma.chapter.count({ where: { novelId: job.novelId, scrapeStatus: 'COMPLETED', ...(selectedIds ? { id: { in: selectedIds } } : {}) } })
    : 0
  return prisma.scrapeJob.update({ where: { id }, data: { status: 'PENDING', progress, error: null, completedAt: null } })
})
