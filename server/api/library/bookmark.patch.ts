import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { putNovelInSourceLibrary } from '~/server/services/libraries'

export default defineEventHandler(async (event) => {
  const body = z.object({ novelId: z.string().min(1), libraryId: z.string().min(1) }).parse(await readBody(event))
  const novel = await prisma.novel.findUnique({ where: { id: body.novelId }, select: { sourceSite: true } })
  if (!novel) throw createError({ statusCode: 404, statusMessage: 'Title not found' })
  const library = await putNovelInSourceLibrary(body.novelId, novel.sourceSite, body.libraryId)
  return { library }
})
