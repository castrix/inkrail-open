import { fetchSourceMetadata } from './sources'
import { sourceManifest } from './extensions'
const cache = new Map<string, { expires: number, value: ReturnType<typeof fetchSourceMetadata> }>()
export async function mangaStreamMetadata(source: string, id: string) {
  const manifest = await sourceManifest(source)
  const key = `${source}:${manifest.version}:${id}`
  const previous = cache.get(key)
  if (previous && previous.expires > Date.now()) return previous.value
  const value = fetchSourceMetadata(source, id)
  cache.set(key, { expires: Date.now() + 60000, value })
  if (cache.size > 100) cache.delete(cache.keys().next().value!)
  try { return await value } catch (error) { cache.delete(key); throw error }
}
export async function mangaStreamPage(source: string, id: string, position: number) {
  const metadata = await mangaStreamMetadata(source, id)
  const page = metadata.pages.find(p => p.position === position)
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Manga page not found' })
  return { metadata, page }
}
