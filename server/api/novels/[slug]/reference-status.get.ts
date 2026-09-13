import prisma from '~/server/lib/prisma'
export default defineEventHandler(async event => {
  const novel = await prisma.novel.findUnique({ where: { slug: getRouterParam(event, 'slug')! }, select: { id: true, readingProgress: { select: { chapter: { select: { position: true } } } } } })
  if (!novel) throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  const scope = { novelId: novel.id, firstPosition: { lte: novel.readingProgress?.chapter.position || 0 }, excluded: false }
  const [profiles, skins, entries, mentions] = await Promise.all([
    prisma.characterVisualProfile.aggregate({ where: scope, _max: { updatedAt: true }, _count: true }),
    prisma.characterSkin.aggregate({ where: { profile: scope }, _max: { updatedAt: true }, _count: true }),
    prisma.encyclopediaEntry.aggregate({ where: { novelId: novel.id, firstPosition: { lte: novel.readingProgress?.chapter.position || 0 } }, _max: { updatedAt: true }, _count: true }),
    prisma.encyclopediaMention.aggregate({ where: { entry: { novelId: novel.id }, chapterPosition: { lte: novel.readingProgress?.chapter.position || 0 } }, _max: { updatedAt: true }, _count: true })
  ])
  return { version: JSON.stringify([profiles, skins, entries, mentions, novel.readingProgress?.chapter.position]) }
})
