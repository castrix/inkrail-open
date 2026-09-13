import { z } from 'zod'
import { queueTwkanDownload } from '~/server/services/scraper'

export default defineEventHandler(async (event) => {
  const body = z.object({
    sourceNovelId: z.string().regex(/^\d+$/),
    sourceChapterIds: z.array(z.string().regex(/^\d+$/)).min(1).optional()
  }).parse(await readBody(event))
  return queueTwkanDownload(body.sourceNovelId, body.sourceChapterIds)
})
