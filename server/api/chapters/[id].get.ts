import prisma from '~/server/lib/prisma'
import { readUtf8 } from '~/server/services/storage'

function markdownParagraphs(markdown: string | null) {
  if (!markdown) return { title: '', paragraphs: [] as string[] }
  const parts = markdown.replace(/\r/g, '').split(/\n{2,}/).map(value => value.trim()).filter(Boolean)
  return { title: parts.shift()?.replace(/^#\s*/, '') || '', paragraphs: parts }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const chapter = await prisma.chapter.findUnique({ where: { id }, include: { novel: true, translations: true, encyclopediaScan: true } })
  if (!chapter) throw createError({ statusCode: 404, statusMessage: 'Chapter not found' })
  const [previous, next, translationJob, encyclopediaEntries, chapterMentions] = await Promise.all([
    prisma.chapter.findFirst({ where: { novelId: chapter.novelId, position: { lt: chapter.position } }, orderBy: { position: 'desc' }, select: { id: true, titleOriginal: true, titleTranslated: true } }),
    prisma.chapter.findFirst({ where: { novelId: chapter.novelId, position: { gt: chapter.position } }, orderBy: { position: 'asc' }, select: { id: true, titleOriginal: true, titleTranslated: true } }),
    prisma.scrapeJob.findFirst({ where: { type: 'TRANSLATE_CHAPTER', payload: chapter.id, status: { in: ['PENDING', 'RUNNING', 'CANCEL_REQUESTED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, priority: true } }),
    prisma.encyclopediaEntry.findMany({
      where: { novelId: chapter.novelId, firstPosition: { lt: chapter.position } },
      include: { mentions: { where: { chapterPosition: { lt: chapter.position } }, orderBy: { chapterPosition: 'asc' } }, visualProfile: { include: { skins: { where: { introducedAtPosition: { lt: chapter.position }, status: 'APPROVED' }, orderBy: { introducedAtPosition: 'desc' } } } } },
      orderBy: [{ type: 'asc' }, { translatedName: 'asc' }, { originalName: 'asc' }]
    }),
    prisma.encyclopediaMention.findMany({ where: { chapterId: chapter.id }, select: { entryId: true } })
  ])
  const statusRecord = chapter.translations.find(item => item.targetLanguage === chapter.novel.targetLanguage)
  const translation = statusRecord && ['APPROVED', 'TRANSLATED', 'NEEDS_REVIEW'].includes(statusRecord.status) && statusRecord.outputPath ? statusRecord : null
  const [sourceText, translatedText] = await Promise.all([
    chapter.sourcePath ? readUtf8(chapter.sourcePath).catch(() => null) : null,
    translation?.outputPath ? readUtf8(translation.outputPath).catch(() => null) : null
  ])
  const contextChapterIds = encyclopediaEntries.flatMap(entry => {
    const firstMention = entry.mentions[0]
    const lastMention = entry.mentions.at(-1)
    return [firstMention?.chapterId || entry.firstChapterId, lastMention?.chapterId].filter((chapterId): chapterId is string => Boolean(chapterId))
  })
  const contextChapters = new Map((await prisma.chapter.findMany({
    where: { id: { in: [...new Set(contextChapterIds)] } },
    select: { id: true, position: true, titleOriginal: true, titleTranslated: true }
  })).map(item => [item.id, item]))
  const mentionedIds = new Set(chapterMentions.map(mention => mention.entryId))
  const entities = encyclopediaEntries.map(entry => {
    let aliases: string[] = []
    try { aliases = JSON.parse(entry.aliasesJson || '[]') } catch { /* Stored aliases are optional display metadata. */ }
    const firstMention = entry.mentions[0]
    const lastMention = entry.mentions.at(-1)
    return {
      id: entry.id, type: entry.type, originalName: entry.originalName, translatedName: entry.translatedName,
      aliases, description: lastMention?.description || '',
      avatarUrl: entry.visualProfile?.skins[0]?.imagePath ? `/api/character-visuals/skins/${entry.visualProfile.skins[0].id}/image?v=${entry.visualProfile.skins[0].updatedAt.getTime()}` : null,
      fullBodyImageUrl: entry.visualProfile?.skins[0]?.fullBodyPath ? `/api/character-visuals/skins/${entry.visualProfile.skins[0].id}/image?view=full&v=${entry.visualProfile.skins[0].updatedAt.getTime()}` : null,
      firstIntroduction: firstMention ? { description: firstMention.description, chapter: contextChapters.get(firstMention.chapterId) || null } : null,
      lastAppearanceBeforeChapter: lastMention ? { description: lastMention.description, chapter: contextChapters.get(lastMention.chapterId) || null } : null,
      mentionedHere: mentionedIds.has(entry.id)
    }
  })
  return {
    chapter, source: markdownParagraphs(sourceText), translation: markdownParagraphs(translatedText), entities,
    dictionary: { status: chapter.encyclopediaScan?.status || 'NOT_STARTED', error: chapter.encyclopediaScan?.error || null },
    translationStatus: statusRecord?.status || 'NOT_STARTED', translationJob, previous, next
  }
})
