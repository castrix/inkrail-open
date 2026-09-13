import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { nextZonedRun, validTimezone } from '~/shared/utils/scheduler'

const input = z.object({ enabled: z.boolean().optional(), timezone: z.string().refine(validTimezone, 'Choose a valid IANA timezone').optional(), localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).refine(value => value.enabled !== undefined || value.localTime !== undefined || value.timezone !== undefined)

export default defineEventHandler(async (event) => {
  const id = z.string().min(1).parse(getRouterParam(event, 'id'))
  const body = input.parse(await readBody(event))
  const current = await prisma.novelSyncSchedule.findUnique({ where: { id } })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Schedule not found' })
  const localTime = body.localTime || current.localTime
  return prisma.novelSyncSchedule.update({ where: { id }, data: { ...body, ...(body.localTime || body.timezone || body.enabled === true ? { nextRunAt: nextZonedRun(localTime, body.timezone || current.timezone) } : {}), ...(body.enabled === true ? { error: null } : {}) } })
})
