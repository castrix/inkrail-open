import { refreshCharacterCandidates } from '~/server/services/character-visuals'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ novelId?: string }>(event)
  if (!body.novelId) throw createError({ statusCode: 400, statusMessage: 'novelId is required' })
  const candidates = await refreshCharacterCandidates(body.novelId)
  return { candidates: candidates.length }
})
