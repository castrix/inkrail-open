import { z } from 'zod'
import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = z.object({ novelId: z.string().min(1), libraryId: z.string().min(1).optional() }).parse(await readBody(event))
  const removed = await prisma.libraryNovel.deleteMany({
    where: { novelId: body.novelId, ...(body.libraryId ? { libraryId: body.libraryId } : {}) }
  })
  return { removed: removed.count }
})
