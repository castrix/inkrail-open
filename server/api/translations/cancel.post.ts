import { z } from 'zod'
import { cancelTranslationJobs } from '~/server/services/translation'

export default defineEventHandler(async (event) => {
  const body = z.object({
    jobIds: z.array(z.string()).optional(),
    chapterIds: z.array(z.string()).optional()
  }).refine(value => value.jobIds?.length || value.chapterIds?.length, 'Select at least one translation to cancel').parse(await readBody(event))
  return cancelTranslationJobs(body)
})
