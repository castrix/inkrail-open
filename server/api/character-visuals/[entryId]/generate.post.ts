import { queueCharacterImage } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  const entryId = getRouterParam(event, 'entryId')!
  return queueCharacterImage(entryId)
})
