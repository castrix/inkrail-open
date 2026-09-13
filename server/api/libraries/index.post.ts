import { z } from 'zod'
import prisma from '~/server/lib/prisma'
import { ensureDefaultLibrary } from '~/server/services/libraries'

export default defineEventHandler(async (event) => {
  await ensureDefaultLibrary()
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(await readBody(event))
  const existing = await prisma.library.findUnique({ where: { name } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'A library with that name already exists' })
  return prisma.library.create({ data: { name } })
})
