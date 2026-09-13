import prisma from '~/server/lib/prisma'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, mediaType: true, readingProgress: { select: { chapter: { select: { position: true } } } } }
  })
  if (!novel) throw createError({ statusCode: 404, statusMessage: 'Novel not found' })
  const throughPosition = novel.readingProgress?.chapter.position || 0
  const encyclopediaEntries = throughPosition ? await prisma.encyclopediaEntry.findMany({
    where: { novelId: novel.id, firstPosition: { lte: throughPosition } },
    include: { mentions: { where: { chapterPosition: { lte: throughPosition } }, orderBy: { chapterPosition: 'desc' }, take: 1 } },
    orderBy: [{ type: 'asc' }, { translatedName: 'asc' }, { originalName: 'asc' }]
  }) : []
  const collisionCounts = new Map<string, number>()
  for (const entry of encyclopediaEntries) {
    const key = `${entry.type}:${(entry.translatedName || '').toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '')}`
    if (entry.translatedName) collisionCounts.set(key, (collisionCounts.get(key) || 0) + 1)
  }
  const characterVisuals = throughPosition ? await prisma.characterVisualProfile.findMany({
    where: { novelId: novel.id, firstPosition: { lte: throughPosition }, excluded: false },
    include: { entry: true, skins: { orderBy: { introducedAtPosition: 'asc' } } },
    orderBy: { importanceScore: 'desc' }
  }) : []
  return {

    characterVisuals: characterVisuals.map(profile => ({
      id: profile.id, entryId: profile.entryId, name: profile.entry.translatedName || profile.entry.originalName,
      originalName: profile.entry.originalName, importanceScore: profile.importanceScore,
      mentionedChapterCount: profile.mentionedChapterCount, status: profile.status,
      evidenceThroughPosition: profile.evidenceThroughPosition,
      skinDetectionStatus: profile.skinDetectionStatus,
      skinDetectionError: profile.skinDetectionError,
      skinDetectedAt: profile.skinDetectedAt,
      visualIdentity: profile.visualIdentityJson ? JSON.parse(profile.visualIdentityJson) : null,
      error: profile.error,
      skins: profile.skins.map(skin => skin.introducedAtPosition > throughPosition
        ? { id: skin.id, introducedAtPosition: skin.introducedAtPosition, status: skin.status, locked: true }
        : { id: skin.id, name: skin.name, description: skin.description, changeType: skin.changeType, confidence: skin.confidence, origin: skin.origin, introducedAtPosition: skin.introducedAtPosition, status: skin.status, locked: false, isDefault: skin.isDefault, imageUrl: skin.imagePath ? `/api/character-visuals/skins/${skin.id}/image?v=${skin.updatedAt.getTime()}` : null, originalImageUrl: skin.imagePath ? `/api/character-visuals/skins/${skin.id}/image?original=1&v=${skin.updatedAt.getTime()}` : null, fullBodyImageUrl: skin.fullBodyPath ? `/api/character-visuals/skins/${skin.id}/image?view=full&v=${skin.updatedAt.getTime()}` : null, originalFullBodyImageUrl: skin.fullBodyPath ? `/api/character-visuals/skins/${skin.id}/image?view=full&original=1&v=${skin.updatedAt.getTime()}` : null, error: skin.error })
    })),
    encyclopediaEntries: encyclopediaEntries.map(entry => ({
      id: entry.id, type: entry.type, originalName: entry.originalName, translatedName: entry.translatedName,
      aliases: JSON.parse(entry.aliasesJson || '[]'), description: entry.mentions[0]?.description || '', physicalDescription: entry.mentions[0]?.physicalDescription || '', firstPosition: entry.firstPosition,
      lastPosition: entry.mentions[0]?.chapterPosition || entry.firstPosition,
      nameCollision: (collisionCounts.get(`${entry.type}:${(entry.translatedName || '').toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '')}`) || 0) > 1
    }))
  }
})
