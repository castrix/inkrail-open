import { z } from 'zod'

export function dictionaryBatchSize(value = process.env.DICTIONARY_BATCH_SIZE) {
  return Math.max(1, Math.min(5, Math.floor(Number(value) || 3)))
}

export const DICTIONARY_BATCH_MAX_CHARS = 30_000

const entity = z.object({
  type: z.enum(['CHARACTER', 'PLACE']), matchedEntryId: z.string(), originalName: z.string().min(2),
  translatedName: z.string().min(1), aliases: z.array(z.string()), shortDescription: z.string().min(1), physicalDescription: z.string()
}).strict()

export function validateDictionaryBatch(value: unknown, chapterIds: string[]) {
  const result = z.object({ chapters: z.array(z.object({ chapterId: z.string(), entities: z.array(entity).max(60) }).strict()) }).strict().parse(value)
  const returned = result.chapters.map(chapter => chapter.chapterId)
  if (returned.length !== chapterIds.length || new Set(returned).size !== returned.length || returned.some(id => !chapterIds.includes(id))) {
    throw new Error('Dictionary batch must return every requested chapter exactly once')
  }
  return result
}
