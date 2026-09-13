import type { ChapterReference } from '~/shared/scraper/types'
import { fetchTwkanDirectory } from './sources'

type Directory = { chapters: ChapterReference[], checkedAt: number, error: string, pending?: Promise<void> }
const directories = new Map<string, Directory>()
export function cachedNovelDirectory(id: string) { return directories.get(id)?.chapters || [] }
export function refreshNovelDirectory(id: string, sourceId: string, force = false) {
  let entry = directories.get(id)
  if (!entry) { entry = { chapters: [], checkedAt: 0, error: '' }; directories.set(id, entry) }
  if (!entry.pending && (force || Date.now() - entry.checkedAt > (entry.error ? 60_000 : 5 * 60_000))) {
    const current = entry
    current.error = ''
    current.pending = fetchTwkanDirectory(sourceId).then(result => { current.chapters = result.parsed.chapters }).catch(() => {
      current.error = 'Could not check TWKAN. Your local chapters are still available.'
    }).finally(() => {
      current.checkedAt = Date.now(); current.pending = undefined
      if (directories.size > 50) for (const [key, item] of directories) { if (key !== id && !item.pending) { directories.delete(key); break } }
    })
  }
  return { pending: entry.pending, state: { refreshing: Boolean(entry.pending), checkedAt: entry.checkedAt, error: entry.error, total: entry.chapters.length } }
}
