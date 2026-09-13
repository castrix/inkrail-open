import { queueCharacterSkinDetection } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  return queueCharacterSkinDetection(getRouterParam(event, 'entryId')!)
})
