import { z } from 'zod'
import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = z.object({ novelId: z.string(), chapterId: z.string(), position: z.number().min(0).max(1).default(0) }).parse(await readBody(event))
  const chapter = await prisma.chapter.findFirst({ where: { id: body.chapterId, novelId: body.novelId } })
  if (!chapter) throw createError({ statusCode: 400, statusMessage: 'Chapter does not belong to this novel' })
  return prisma.readingProgress.upsert({ where: { novelId: body.novelId }, create: body, update: { chapterId: body.chapterId, position: body.position } })
})
