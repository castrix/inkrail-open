import { z } from 'zod'
import { queueDictionaryReconciliation } from '~/server/services/encyclopedia'

export default defineEventHandler(async (event) => {
  const body = z.object({ novelId: z.string(), repairTranslations: z.boolean().default(false) }).parse(await readBody(event))
  const job = await queueDictionaryReconciliation(body.novelId, body.repairTranslations)
  return { jobId: job.id, status: job.status }
})
