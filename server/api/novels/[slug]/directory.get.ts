import prisma from '~/server/lib/prisma'
import { refreshNovelDirectory } from '~/server/services/novel-directory'
export default defineEventHandler(async event => {
  const novel = await prisma.novel.findUnique({ where: { slug: getRouterParam(event, 'slug')! }, select: { id: true, sourceNovelId: true, mediaType: true } })
  if (!novel || novel.mediaType !== 'NOVEL') throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  const result = refreshNovelDirectory(novel.id, novel.sourceNovelId, getQuery(event).force === '1')
  if (result.pending) event.waitUntil(result.pending)
  return result.state
})
