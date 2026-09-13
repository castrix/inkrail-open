import { requireTranslationEnabled } from '~/server/utils/translation-enabled'
import { queueCharacterImage } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  requireTranslationEnabled()
  const entryId = getRouterParam(event, 'entryId')!
  return queueCharacterImage(entryId)
})
