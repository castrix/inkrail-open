import prisma from '~/server/lib/prisma'
import { ensureDefaultLibrary } from '~/server/services/libraries'

export default defineEventHandler(async () => {
  await ensureDefaultLibrary()
  return prisma.library.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], include: { _count: { select: { novels: true } } } })
})
