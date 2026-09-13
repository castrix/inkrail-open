import { z } from 'zod'
import { queueHentaiNexusDownload } from '~/server/services/scraper'

export default defineEventHandler(async (event) => {
  const body = z.object({ sourceNovelId: z.string().regex(/^\d+$/), sourcePageIds: z.array(z.string().regex(/^\d+$/)).min(1).optional(), libraryId: z.string().optional() }).parse(await readBody(event))
  return queueHentaiNexusDownload(body.sourceNovelId, body.sourcePageIds, body.libraryId)
})
