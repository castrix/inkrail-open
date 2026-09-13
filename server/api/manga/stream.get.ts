import { z } from 'zod'
import { readerManifest } from '~/server/services/reader-manifest'
export default defineEventHandler(event => readerManifest(z.object({
  sourceSite: z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/), sourceNovelId: z.string().min(1).max(500)
}).parse(getQuery(event))))
