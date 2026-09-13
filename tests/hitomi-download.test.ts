import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ metadata: vi.fn(), update: vi.fn(), transaction: vi.fn() }))
vi.mock('../server/services/sources', () => ({ fetchSourceMetadata: mocks.metadata }))
vi.mock('../server/lib/prisma', () => ({ default: { mangaPage: { update: mocks.update }, $transaction: mocks.transaction } }))
import { refreshHitomiDownloadPages } from '../server/services/hitomi-download'

describe('Hitomi download URL refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.transaction.mockResolvedValue([])
    mocks.metadata.mockResolvedValue({ pages: [
      { sourcePageId: '1', sourceUrl: 'https://a2.example/new/one.avif', thumbnailUrl: 'https://thumb.example/one' },
      { sourcePageId: '2', sourceUrl: 'https://a1.example/new/two.avif', thumbnailUrl: 'https://thumb.example/two' }
    ] })
  })
  it('bypasses cached routing and refreshes only the selected unfinished pages', async () => {
    const pages = [{ id: 'db-two', sourcePageId: '2', sourceUrl: 'https://a2.example/old/two.avif', thumbnailUrl: null }]
    await refreshHitomiDownloadPages('123', pages)
    expect(mocks.metadata).toHaveBeenCalledWith('hitomi', '123', { forceRefresh: true })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'db-two' }, data: { sourceUrl: 'https://a1.example/new/two.avif', thumbnailUrl: 'https://thumb.example/two' } })
    expect(pages[0]?.sourceUrl).toBe('https://a1.example/new/two.avif')
  })
  it('does not reuse stale URLs when the page is missing from the manifest', async () => {
    await expect(refreshHitomiDownloadPages('123', [{ id: 'missing', sourcePageId: '3', sourceUrl: 'old', thumbnailUrl: null }])).rejects.toThrow('missing from the current gallery manifest')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('does not change in-memory URLs if persistence fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('Database unavailable'))
    const pages = [{ id: 'one', sourcePageId: '1', sourceUrl: 'old', thumbnailUrl: null }]
    await expect(refreshHitomiDownloadPages('123', pages)).rejects.toThrow('Database unavailable')
    expect(pages[0]?.sourceUrl).toBe('old')
  })
})
