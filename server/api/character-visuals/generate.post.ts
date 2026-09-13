import { requireTranslationEnabled } from '~/server/utils/translation-enabled'
import { queueDetectedSkinImages } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  requireTranslationEnabled()
  const body = await readBody<{ skinIds?: string[], entryId?: string, scope?: string }>(event)
  return queueDetectedSkinImages(body || {})
})
