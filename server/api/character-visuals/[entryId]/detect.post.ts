import { requireTranslationEnabled } from '~/server/utils/translation-enabled'
import { queueCharacterSkinDetection } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  requireTranslationEnabled()
  return queueCharacterSkinDetection(getRouterParam(event, 'entryId')!)
})
