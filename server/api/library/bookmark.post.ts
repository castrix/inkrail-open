import { z } from 'zod'
import { bookmarkSource } from '~/server/services/scraper'
export default defineEventHandler(async event => {
 const body = z.object({ sourceSite: z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/), sourceNovelId: z.string().min(1).max(500), libraryId: z.string().optional() }).parse(await readBody(event))
 return bookmarkSource(body.sourceSite, body.sourceNovelId, body.libraryId)
})
