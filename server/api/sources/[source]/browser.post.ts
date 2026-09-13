import { invokeSource } from '~/server/services/extensions'
import { isLoopbackHost } from '~/server/utils/loopback'
export default defineEventHandler(event => {
  if (!isLoopbackHost(getHeader(event, 'host')) && !useRuntimeConfig().remoteBrowserControl) throw createError({ statusCode: 403, statusMessage: 'Remote browser control is disabled' })
  return invokeSource(getRouterParam(event, 'source')!, 'browser', { action: 'open' })
})
