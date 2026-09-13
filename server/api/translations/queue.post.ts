import { z } from 'zod'
import { queueNovelTranslations } from '~/server/services/translation'

export default defineEventHandler(async (event) => {
  const body = z.object({
    novelId: z.string(),
    chapterIds: z.array(z.string()).optional(),
    regenerate: z.boolean().optional().default(false),
    scope: z.enum(['all', 'recent']).optional().default('all')
  }).parse(await readBody(event))
  return { queued: await queueNovelTranslations(body.novelId, body.chapterIds, { regenerate: body.regenerate, fromReadingProgress: body.scope === 'recent' }) }
})
