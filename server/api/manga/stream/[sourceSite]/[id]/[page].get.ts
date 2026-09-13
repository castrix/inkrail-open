import { z } from 'zod'
import { mangaStreamPage } from '~/server/services/manga-stream'
import { sourceAsset } from '~/server/services/extensions'

export default defineEventHandler(async (event) => {
  const route = z.object({
    sourceSite: z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/), id: z.string().min(1).max(500), page: z.coerce.number().int().min(1)
  }).parse({ sourceSite: getRouterParam(event, 'sourceSite'), id: getRouterParam(event, 'id'), page: getRouterParam(event, 'page') })
  const { metadata, page } = await mangaStreamPage(route.sourceSite, route.id, route.page)
  const thumbnail = ['1', 'true'].includes(String(getQuery(event).thumbnail || ''))
  let imageUrl = thumbnail ? page.thumbnailUrl : page.sourceUrl
  const headers = { referer: metadata.sourceUrl, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
  let binary: Buffer
  try { binary = await sourceAsset(route.sourceSite, imageUrl, headers.referer) } catch (error) {
    if (!thumbnail) throw error
    imageUrl = page.sourceUrl
    binary = await sourceAsset(route.sourceSite, imageUrl, headers.referer)
  }
  const extension = imageUrl.match(/\.(png|webp|avif|gif|jpe?g)(?:\?|$)/i)?.[1]?.toLowerCase()
  setHeader(event, 'content-type', extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : extension === 'avif' ? 'image/avif' : extension === 'gif' ? 'image/gif' : 'image/jpeg')
  setHeader(event, 'cache-control', 'private, max-age=3600')
  return binary
})
