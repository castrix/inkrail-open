import { requireTranslationEnabled } from '~/server/utils/translation-enabled'
import { z } from 'zod'
import { queueEncyclopediaScans } from '~/server/services/encyclopedia'

export default defineEventHandler(async (event) => {
  requireTranslationEnabled()
  const body = z.object({ novelId: z.string(), chapterIds: z.array(z.string()).optional() }).parse(await readBody(event))
  return { queued: await queueEncyclopediaScans(body.novelId, body.chapterIds, { upgradeIdentity: true }) }
})
