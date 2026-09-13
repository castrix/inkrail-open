import type { Novel } from '@prisma/client'
const pending = new Map<string, Promise<void>>()
const retryAt = new Map<string, number>()

export function repairMangaMetadata(novel: Novel): Promise<void> | undefined {
  if (pending.has(novel.id)) return pending.get(novel.id)
  if ((retryAt.get(novel.id) || 0) > Date.now()) return
  if (novel.coverPath && novel.tagsJson && novel.sourceLanguage !== 'unknown') return
  const task = (async () => {
    try {
      const [{ mangaStreamMetadata }, { cacheMangaCover }] = await Promise.all([import('./manga-stream'), import('./scraper')])
      const metadata = await mangaStreamMetadata(novel.sourceSite, novel.sourceNovelId)
      await cacheMangaCover(novel, metadata)
      retryAt.set(novel.id, Date.now() + 6 * 60 * 60_000)
    } catch { retryAt.set(novel.id, Date.now() + 10 * 60_000) }
    finally {
      pending.delete(novel.id)
      if (retryAt.size > 1000) for (const [key, time] of retryAt) if (time < Date.now()) retryAt.delete(key)
    }
  })()
  pending.set(novel.id, task)
  return task
}
