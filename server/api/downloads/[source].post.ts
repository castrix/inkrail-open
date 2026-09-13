import { z } from 'zod'
import { queueSourceDownload } from '~/server/services/scraper'
export default defineEventHandler(async event => {
  const body = z.object({ sourceNovelId: z.string().min(1).max(500), sourceChapterIds: z.array(z.string()).optional(), sourcePageIds: z.array(z.string()).optional(), libraryId: z.string().optional() }).parse(await readBody(event))
  return queueSourceDownload(getRouterParam(event, 'source')!, body.sourceNovelId, body.sourceChapterIds || body.sourcePageIds, body.libraryId)
})
