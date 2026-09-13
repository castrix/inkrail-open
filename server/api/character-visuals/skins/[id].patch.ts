import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ action?: string }>(event)
  if (!['dismiss', 'restore'].includes(body?.action || '')) throw createError({ statusCode: 400, statusMessage: 'Unknown skin action' })
  const skin = await prisma.characterSkin.findUnique({ where: { id } })
  if (!skin) throw createError({ statusCode: 404, statusMessage: 'Skin not found' })
  if (['QUEUED', 'GENERATING'].includes(skin.status)) throw createError({ statusCode: 409, statusMessage: 'An active skin cannot be dismissed' })
  return prisma.characterSkin.update({ where: { id }, data: { status: body.action === 'dismiss' ? 'DISMISSED' : 'PROPOSED', error: null } })
})
