import prisma from '~/server/lib/prisma'

export default defineEventHandler(async () => {
  const items = await prisma.novelSyncSchedule.findMany({ include: { novel: { select: { id: true, slug: true, titleOriginal: true, titleTranslated: true } } }, orderBy: [{ enabled: 'desc' }, { nextRunAt: 'asc' }] })
  return { items: items.map(item => ({ ...item, result: item.lastResult ? JSON.parse(item.lastResult) : null })) }
})
