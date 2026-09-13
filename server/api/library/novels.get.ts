import prisma from '~/server/lib/prisma'
export default defineEventHandler(() => prisma.novel.findMany({
  where: { mediaType: 'NOVEL', contentRating: { not: 'ADULT' }, libraryEntries: { some: {} } },
  select: { id: true, slug: true, titleOriginal: true }, orderBy: { titleOriginal: 'asc' }
}))
