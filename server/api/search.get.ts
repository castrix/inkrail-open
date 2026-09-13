import prisma from '~/server/lib/prisma'
import { sourceList, invokeSource } from '~/server/services/extensions'
import { cachedSourceSearch } from '~/server/services/search-cache'

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).q || '').trim()
  const includeAdult = ['1', 'true'].includes(String(getQuery(event).includeAdult || ''))
  const scope = String(getQuery(event).scope || 'all')
  const requestedSource = String(getQuery(event).source || 'all')
  const source = requestedSource
  const revalidate = ['1', 'true'].includes(String(getQuery(event).revalidate || ''))
  if (!query) return { query, local: [], sources: [], errors: [] }

  const local = scope === 'sources' ? [] : await prisma.novel.findMany({
    where: {
      libraryEntries: { some: {} },
      ...(includeAdult ? {} : { contentRating: { not: 'ADULT' } }),
      ...(source !== 'all' ? { sourceSite: source } : {}),
      OR: [
        { titleOriginal: { contains: query } }, { titleTranslated: { contains: query } },
        { author: { contains: query } }, { category: { contains: query } },
        { description: { contains: query } }, { tagsJson: { contains: query } }
      ]
    },
    orderBy: { updatedAt: 'desc' }, take: 40,
    select: { id: true, slug: true, mediaType: true, contentRating: true, titleOriginal: true, titleTranslated: true, author: true, category: true, sourceSite: true, sourceNovelId: true, coverPath: true, coverUrl: true }
  })
  const localResults = local.map(item => ({ ...item, coverUrl: item.coverPath ? `/api/novels/${item.id}/cover` : item.coverUrl }))
  if (scope === 'local') return { query, local: localResults, sources: [], errors: [] }

  const timed = <T>(promise: Promise<T>, source: string) => Promise.race<T>([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${source} timed out`)), 15_000))])
  const requests: Array<{ source: string, run: Promise<any> }> = []
  for (const manifest of await sourceList()) {
    if ((source === 'all' || source === manifest.id) && (includeAdult || manifest.contentRating !== 'ADULT') && manifest.capabilities.includes('search')) requests.push({ source: manifest.id, run: timed(cachedSourceSearch(`global:${manifest.id}:${query}`, () => invokeSource(manifest.id, 'search', { query, page: 1 }), revalidate), manifest.name) })
  }
  const settled = await Promise.allSettled(requests.map(request => request.run))
  const sources = settled.flatMap((result, index) => result.status === 'fulfilled'
    ? (result.value.results || []).slice(0, 12).map((item: any) => ({ ...item, sourceSite: requests[index]!.source }))
    : [])
  const errors = settled.flatMap((result, index) => result.status === 'rejected' ? [{ source: requests[index]!.source, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }] : [])
  const cache = settled.flatMap((result, index) => result.status === 'fulfilled' ? [{ source: requests[index]!.source, ...(result.value._cache || {}) }] : [])
  return {
    query,
    local: localResults,
    sources, errors, cache
  }
})
