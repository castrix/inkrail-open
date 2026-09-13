import prisma from '~/server/lib/prisma'
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Schedule ID is required' })
  const result = await prisma.novelSyncSchedule.deleteMany({ where: { id } })
  if (!result.count) throw createError({ statusCode: 404, statusMessage: 'Schedule not found' })
  return { ok: true }
})
