import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { nextZonedRun, validTimezone } from '~/shared/utils/scheduler'

const input = z.object({ novelId: z.string().min(1), timezone: z.string().refine(validTimezone, 'Choose a valid IANA timezone').default('Asia/Jakarta'), localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:00') })

export default defineEventHandler(async (event) => {
  const body = input.parse(await readBody(event))
  const novel = await prisma.novel.findUnique({ where: { id: body.novelId }, select: { mediaType: true, sourceSite: true } })
  if (!novel) throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  if (novel.mediaType !== 'NOVEL') throw createError({ statusCode: 400, statusMessage: 'This source does not support scheduled sync' })
  return prisma.novelSyncSchedule.upsert({ where: { novelId: body.novelId }, create: { novelId: body.novelId, localTime: body.localTime, timezone: body.timezone, nextRunAt: nextZonedRun(body.localTime, body.timezone) }, update: { enabled: true, localTime: body.localTime, timezone: body.timezone, nextRunAt: nextZonedRun(body.localTime, body.timezone), error: null } })
})
