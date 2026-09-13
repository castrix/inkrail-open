import { z } from 'zod'
import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = z.object({ novelId: z.string(), source: z.string().min(1), translation: z.string().min(1), category: z.string().default('term'), notes: z.string().optional(), locked: z.boolean().default(true) }).parse(await readBody(event))
  return prisma.glossaryTerm.upsert({
    where: { novelId_source: { novelId: body.novelId, source: body.source } },
    create: body,
    update: { translation: body.translation, category: body.category, notes: body.notes, locked: body.locked, version: { increment: 1 } }
  })
})
