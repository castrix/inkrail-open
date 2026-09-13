import { describe, expect, it } from 'vitest'
import { mapTachimangaEntry, planTachimangaImport, type TachimangaEntry } from '../shared/utils/tachimanga'

const entry = (overrides: Partial<TachimangaEntry> = {}): TachimangaEntry => ({
  id: 1, title: 'Example', url: '/g/123/', pkg_name: 'eu.kanade.tachiyomi.extension.all.nhentai', categories: ['manga'], ...overrides
})

describe('Tachimanga import', () => {
  it('maps supported bookmarks without pretending pages are downloaded', () => {
    expect(mapTachimangaEntry(entry({ lang: 'en', genre: 'One, Two' }))).toMatchObject({
      sourceSite: 'nhentai', sourceNovelId: '123', sourceUrl: 'https://nhentai.net/g/123/',
      mediaType: 'MANGA', contentRating: 'ADULT', sourceLanguage: 'english', tagsJson: '["One","Two"]'
    })
    expect(mapTachimangaEntry(entry({ pkg_name: 'eu.kanade.tachiyomi.extension.en.hentainexus', url: '/view/456' }))?.sourceNovelId).toBe('456')
  })
  it('uses the final Hitomi id when a title contains other numbers', () => {
    expect(mapTachimangaEntry(entry({ pkg_name: 'eu.kanade.tachiyomi.extension.all.hitomi', url: '/doujinshi/title-372676-2008936.html' }))?.sourceNovelId).toBe('2008936')
    expect(mapTachimangaEntry(entry({ pkg_name: 'eu.kanade.tachiyomi.extension.all.hitomi', url: '/galleries/456.html' }))?.sourceNovelId).toBe('456')
  })
  it('does not confuse similarly named sources or accept unrelated hosts', () => {
    expect(mapTachimangaEntry(entry({ pkg_name: 'eu.kanade.tachiyomi.extension.all.nhentaixxx' }))).toBeNull()
    expect(mapTachimangaEntry(entry({ url: 'https://example.com/g/123/' }))).toBeNull()
    expect(mapTachimangaEntry(entry({ url: '/g/not-an-id/' }))).toBeNull()
  })
  it('merges duplicate language variants and preserves their categories', () => {
    const plan = planTachimangaImport([entry(), entry({ id: 2, categories: ['favorites'], lang: 'en' })])
    expect(plan.duplicates).toBe(1)
    expect(plan.supported).toHaveLength(1)
    expect(plan.supported[0]?.libraries).toEqual(['Tachimanga · manga', 'Tachimanga · favorites'])
  })
  it('reports unsupported entries and provides an uncategorized shelf', () => {
    const plan = planTachimangaImport([entry({ categories: [] }), entry({ id: 2, pkg_name: null })])
    expect(plan.supported[0]?.libraries).toEqual(['Tachimanga · Uncategorized'])
    expect(plan.skipped).toHaveLength(1)
    expect(plan.skipped[0]?.id).toBe(2)
  })
})
