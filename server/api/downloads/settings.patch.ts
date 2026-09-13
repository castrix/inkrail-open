import { z } from 'zod'
import { sourceManifest } from '~/server/services/extensions'
import { setDownloadSettings } from '../../services/download-settings'
export default defineEventHandler(async event => {
  const body = z.object({ source: z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/), rateLimit: z.boolean() }).parse(await readBody(event))
  await sourceManifest(body.source)
  return setDownloadSettings(body.source, body.rateLimit)
})
