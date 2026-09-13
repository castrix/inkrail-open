import { z } from 'zod'
import { invokeSource } from '~/server/services/extensions'
export default defineEventHandler(event => {
  const params = z.object({ query: z.string().max(500).default(''), page: z.coerce.number().int().min(1).max(10000).default(1) }).passthrough().parse(getQuery(event))
  return invokeSource(getRouterParam(event, 'source')!, 'browse', params)
})
