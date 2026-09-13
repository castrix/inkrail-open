import { z } from 'zod'
import { bookmarkSource, queueSourceDownload } from '~/server/services/scraper'
import { sourceList, invokeSource } from '~/server/services/extensions'

export default defineEventHandler(async (event) => {
  const body = z.object({ url: z.string().url() }).parse(await readBody(event))
  const host = new URL(body.url).hostname.replace(/^www\./, '')
  const source = (await sourceList()).find(s => s.capabilities.includes('resolve') && new URL(s.baseUrl).hostname.replace(/^www\./, '') === host)
  if (!source) throw createError({ statusCode: 400, statusMessage: 'Install a source that supports this URL first' })
  const { id } = await invokeSource(source.id, 'resolve', { url: body.url })
  const bookmarked = await bookmarkSource(source.id, id)
  const download: any = await queueSourceDownload(source.id, id)
  return { novel: bookmarked.novel, chapterCount: download.directoryCount || download.pageCount, job: download.job }
})
