import { queueDetectedSkinImages } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ skinIds?: string[], entryId?: string, scope?: string }>(event)
  return queueDetectedSkinImages(body || {})
})
