import { z } from 'zod'
const chapterSchema = z.object({
  sourceChapterId: z.string().min(1).max(500), titleOriginal: z.string().min(1).max(1000),
  position: z.number().int().positive(), sourcePageIds: z.array(z.string().min(1).max(500)).min(1)
})
export function parseMangaChapters(raw: unknown, pages: Array<{ sourcePageId: string }>) {
  if (raw === undefined) return undefined
  const chapters = z.array(chapterSchema).parse(raw)
  const ids = new Set<string>(), positions = new Set<number>(), usedPages = new Set<string>()
  const knownPages = new Set(pages.map(page => page.sourcePageId))
  for (const chapter of chapters) {
    if (ids.has(chapter.sourceChapterId) || positions.has(chapter.position)) throw new Error('Duplicate manga chapters')
    ids.add(chapter.sourceChapterId); positions.add(chapter.position)
    for (const id of chapter.sourcePageIds) {
      if (!knownPages.has(id) || usedPages.has(id)) throw new Error('Invalid manga chapter page reference')
      usedPages.add(id)
    }
  }
  if (chapters.length && usedPages.size !== knownPages.size) throw new Error('Incomplete manga chapter directory')
  return chapters.sort((a, b) => a.position - b.position)
}
