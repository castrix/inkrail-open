export interface TachimangaEntry {
  id: number
  url: string
  real_url?: string | null
  title: string
  author?: string | null
  artist?: string | null
  description?: string | null
  genre?: string | null
  thumbnail_url?: string | null
  source_name?: string | null
  lang?: string | null
  pkg_name?: string | null
  categories: string[]
}

const sources = {
  'eu.kanade.tachiyomi.extension.all.nhentai': { site: 'nhentai', host: 'nhentai.net', pattern: /^\/g\/(\d+)\/?$/ },
  'eu.kanade.tachiyomi.extension.all.hitomi': { site: 'hitomi', host: 'hitomi.la', pattern: /^\/(?:galleries\/(\d+)|(?:doujinshi|manga|cg|gamecg|imageset|anime)\/[^/]*-(\d+))\.html$/ },
  'eu.kanade.tachiyomi.extension.en.hentainexus': { site: 'hentainexus', host: 'hentainexus.com', pattern: /^\/view\/(\d+)\/?$/ }
} as const

export function mapTachimangaEntry(entry: TachimangaEntry) {
  const source = sources[entry.pkg_name as keyof typeof sources]
  if (!source) return null
  let url: URL
  try { url = new URL(entry.url, `https://${source.host}`) } catch { return null }
  if (url.hostname !== source.host || !['http:', 'https:'].includes(url.protocol)) return null
  const match = source.pattern.exec(url.pathname)
  if (!match) return null
  const sourceNovelId = String(BigInt(match[1] || match[2]!))
  const sourceUrl = source.site === 'hitomi' ? `https://hitomi.la/galleries/${sourceNovelId}.html`
    : source.site === 'nhentai' ? `https://nhentai.net/g/${sourceNovelId}/` : `https://hentainexus.com/view/${sourceNovelId}`
  const tags = (entry.genre || '').split(',').map(tag => tag.trim()).filter(Boolean)
  const languages: Record<string, string> = { en: 'english', ja: 'japanese', zh: 'chinese', ko: 'korean' }
  return {
    sourceSite: source.site, sourceNovelId, sourceUrl, indexUrl: sourceUrl,
    titleOriginal: entry.title, author: entry.author || entry.artist || null,
    description: entry.description || null,
    coverUrl: /^https?:\/\//i.test(entry.thumbnail_url || '') ? entry.thumbnail_url : null,
    tagsJson: JSON.stringify(tags), sourceLanguage: languages[entry.lang || ''] || 'unknown',
    targetLanguage: 'none', mediaType: 'MANGA', contentRating: 'ADULT'
  }
}

export function planTachimangaImport(entries: TachimangaEntry[]) {
  const supported = new Map<string, { metadata: NonNullable<ReturnType<typeof mapTachimangaEntry>>, libraries: string[] }>()
  const skipped: { id: number, title: string, source: string, url: string, reason: string }[] = []
  let duplicates = 0
  for (const entry of entries) {
    const metadata = mapTachimangaEntry(entry)
    if (!metadata) {
      skipped.push({ id: entry.id, title: entry.title, source: entry.source_name || entry.pkg_name || 'Unknown', url: entry.real_url || entry.url, reason: 'Unsupported source or unrecognized gallery URL' })
      continue
    }
    const libraries = entry.categories.length ? entry.categories.map(name => `Tachimanga · ${name}`) : ['Tachimanga · Uncategorized']
    const key = `${metadata.sourceSite}:${metadata.sourceNovelId}`
    const existing = supported.get(key)
    if (existing) {
      duplicates++
      existing.libraries = [...new Set([...existing.libraries, ...libraries])]
    } else supported.set(key, { metadata, libraries: [...new Set(libraries)] })
  }
  return { total: entries.length, duplicates, supported: [...supported.values()], skipped }
}
