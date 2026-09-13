import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { nextJakartaRun } from '~/shared/utils/scheduler'

const input = z.object({ enabled: z.boolean().optional(), localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).refine(value => value.enabled !== undefined || value.localTime !== undefined)

export default defineEventHandler(async (event) => {
  const id = z.string().min(1).parse(getRouterParam(event, 'id'))
  const body = input.parse(await readBody(event))
  const current = await prisma.novelSyncSchedule.findUnique({ where: { id } })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Schedule not found' })
  const localTime = body.localTime || current.localTime
  return prisma.novelSyncSchedule.update({ where: { id }, data: { ...body, ...(body.localTime || body.enabled === true ? { nextRunAt: nextJakartaRun(localTime) } : {}), ...(body.enabled === true ? { error: null } : {}) } })
})
