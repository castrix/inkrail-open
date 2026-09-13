import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const skin = await prisma.characterSkin.findUnique({ where: { id } })
  if (!skin?.imagePath) throw createError({ statusCode: 404, statusMessage: 'Generated skin not found' })
  await prisma.$transaction([
    prisma.characterSkin.updateMany({ where: { profileId: skin.profileId }, data: { isDefault: false } }),
    prisma.characterSkin.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), isDefault: true } }),
    prisma.characterVisualProfile.update({ where: { id: skin.profileId }, data: { status: 'APPROVED', error: null } })
  ])
  return { ok: true }
})
