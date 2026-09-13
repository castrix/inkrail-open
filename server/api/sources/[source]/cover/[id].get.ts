import { fetchSourceMetadata } from '~/server/services/sources'
import { sourceAsset } from '~/server/services/extensions'
export default defineEventHandler(async event => {
  const source = getRouterParam(event, 'source')!, id = getRouterParam(event, 'id')!
  const metadata = await fetchSourceMetadata(source, id)
  const url = metadata.coverUrl || metadata.pages[0]?.thumbnailUrl
  if (!url) throw createError({ statusCode: 404, statusMessage: 'No cover' })
  const binary = await sourceAsset(source, url, metadata.sourceUrl)
  const format = (await import('sharp')).default
  const info = await format(binary).metadata()
  setHeader(event, 'content-type', `image/${info.format || 'jpeg'}`)
  setHeader(event, 'cache-control', 'private, max-age=300')
  return binary
})
