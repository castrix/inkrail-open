import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { syncSourceDirectory } from '~/server/services/scraper'

export default defineEventHandler(async (event) => {
  const id = z.string().min(1).parse(getRouterParam(event, 'slug'))
  const novel = await prisma.novel.findUnique({ where: { id }, select: { mediaType: true, sourceSite: true, sourceNovelId: true } })
  if (!novel) throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  if (novel.mediaType !== 'NOVEL') throw createError({ statusCode: 400, statusMessage: 'This source does not support novel directory sync' })
  return syncSourceDirectory(novel.sourceSite, novel.sourceNovelId)
})
