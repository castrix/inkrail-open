import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({
  chapter: { findMany: vi.fn() }, scrapeJob: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  encyclopediaScan: { upsert: vi.fn() }, $transaction: vi.fn()
}))
vi.mock('../server/lib/prisma', () => ({ default: db }))
import { dictionaryScanCurrent, ensureNovelDictionaryReady, nextDictionaryReadyJob, queueEncyclopediaScans } from '../server/services/dictionary-queue'

const chapter = (status: string | null = null, sourceHash = 'source') => ({ id: 'chapter-10', sourceHash: 'source', encyclopediaScan: status ? { status, sourceHash, identityVersion: 2 } : null })
beforeEach(() => {
  vi.resetAllMocks()
  db.chapter.findMany.mockResolvedValue([])
  db.scrapeJob.findFirst.mockResolvedValue(null)
  db.scrapeJob.findMany.mockResolvedValue([])
  db.scrapeJob.count.mockResolvedValue(0)
  db.$transaction.mockImplementation(async callback => callback(db))
})
describe('dictionary prerequisites', () => {
  it('limits automatic readiness and missing scans to the translated chapter', async () => {
    db.chapter.findMany.mockResolvedValue([chapter()])
    expect(await ensureNovelDictionaryReady('novel', ['chapter-10'])).toBe(false)
    for (const [query] of db.chapter.findMany.mock.calls) expect(query.where.id).toEqual({ in: ['chapter-10'] })
    expect(db.scrapeJob.count.mock.calls[0][0].where.payload).toEqual({ in: ['chapter-10'] })
  })
  it('does not upgrade completed legacy scans automatically', async () => {
    db.chapter.findMany.mockResolvedValue([{ ...chapter(), encyclopediaScan: { status: 'COMPLETED', sourceHash: 'source', identityVersion: 1 } }])
    expect(await ensureNovelDictionaryReady('novel')).toBe(true)
    expect(await queueEncyclopediaScans('novel', undefined, { retryFailed: false })).toBe(0)
    expect(db.scrapeJob.create).not.toHaveBeenCalled()
    expect(await queueEncyclopediaScans('novel', undefined, { upgradeIdentity: true })).toBe(1)
  })
  it('scans all downloaded chapters without a reading-progress restriction', async () => {
    db.chapter.findMany.mockResolvedValue([chapter()])
    expect(await queueEncyclopediaScans('novel')).toBe(1)
    expect(db.chapter.findMany.mock.calls[0][0].where).toEqual({ novelId: 'novel', kind: { not: 'ANNOUNCEMENT' }, scrapeStatus: 'COMPLETED', sourcePath: { not: null }, sourceHash: { not: null } })
    expect(db.scrapeJob.create.mock.calls[0][0].data).toMatchObject({ type: 'EXTRACT_ENTITIES', priority: 10 })
  })
  it('retains explicit chapter selection for the reader action', async () => {
    await queueEncyclopediaScans('novel', ['chosen'])
    expect(db.chapter.findMany.mock.calls[0][0].where.id).toEqual({ in: ['chosen'] })
  })
  it('invalidates scans on source changes, not translation changes', () => {
    expect(dictionaryScanCurrent(chapter('COMPLETED'))).toBe(true)
    expect(dictionaryScanCurrent(chapter('COMPLETED', 'old-source'))).toBe(false)
    expect(dictionaryScanCurrent(chapter('FAILED'))).toBe(false)
    const legacy = { ...chapter(), encyclopediaScan: { status: 'COMPLETED', sourceHash: 'source', identityVersion: 1 } }
    expect(dictionaryScanCurrent(legacy)).toBe(true)
    expect(dictionaryScanCurrent(legacy, true)).toBe(false)
  })
  it('does not duplicate an active scan', async () => {
    db.chapter.findMany.mockResolvedValue([chapter('RUNNING')])
    db.scrapeJob.findFirst.mockResolvedValue({ id: 'existing' })
    expect(await queueEncyclopediaScans('novel')).toBe(0)
    expect(db.scrapeJob.create).not.toHaveBeenCalled()
  })
  it('keeps translation blocked after a scan failure without automatically retrying it', async () => {
    db.chapter.findMany.mockResolvedValue([chapter('FAILED')])
    expect(await ensureNovelDictionaryReady('novel')).toBe(false)
    expect(db.scrapeJob.create).not.toHaveBeenCalled()
    expect(await queueEncyclopediaScans('novel')).toBe(1)
  })
  it('allows translation only after all source scans and active jobs finish', async () => {
    db.chapter.findMany.mockResolvedValue([chapter('COMPLETED')])
    expect(await ensureNovelDictionaryReady('novel')).toBe(true)
    db.scrapeJob.count.mockResolvedValue(1)
    expect(await ensureNovelDictionaryReady('novel')).toBe(false)
  })
  it('does not let a prioritized translation overtake its dictionary or starve another novel', async () => {
    db.chapter.findMany.mockResolvedValue([chapter('FAILED')])
    db.scrapeJob.findFirst.mockResolvedValueOnce({ id: 'translate', novelId: 'blocked', type: 'TRANSLATE_CHAPTER', priority: 999 })
      .mockResolvedValueOnce({ id: 'scan-other', novelId: 'other', type: 'EXTRACT_ENTITIES' })
    expect((await nextDictionaryReadyJob({ type: { in: ['TRANSLATE_CHAPTER', 'EXTRACT_ENTITIES'] } }))?.id).toBe('scan-other')
    expect(db.scrapeJob.findFirst.mock.calls[1][0].where.AND[2].NOT.novelId.in).toEqual(['blocked'])
  })
})
