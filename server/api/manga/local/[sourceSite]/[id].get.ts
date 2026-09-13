import prisma from '~/server/lib/prisma'


export default defineEventHandler(async (event) => {
  const sourceSite = getRouterParam(event, 'sourceSite')!
  const sourceNovelId = getRouterParam(event, 'id')!

  const novel = await prisma.novel.findUnique({
    where: { sourceSite_sourceNovelId: { sourceSite, sourceNovelId } },
    select: {
      id: true,
      slug: true,
      mediaType: true,
      libraryEntries: { select: { library: true } },
      mangaPages: {
        orderBy: { position: 'asc' },
        select: { id: true, sourcePageId: true, downloadStatus: true, error: true }
      }
    }
  })

  if (!novel || novel.mediaType !== 'MANGA') return { localNovel: null, pages: [] }
  return {
    localNovel: {
      id: novel.id,
      slug: novel.slug,
      libraries: novel.libraryEntries.map(entry => entry.library)
    },
    pages: novel.mangaPages
  }
})
