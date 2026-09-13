import { z } from 'zod'
import { prioritizeChapterTranslation } from '~/server/services/translation'

export default defineEventHandler(async (event) => {
  const body = z.object({ chapterId: z.string().min(1) }).parse(await readBody(event))
  return prioritizeChapterTranslation(body.chapterId)
})
