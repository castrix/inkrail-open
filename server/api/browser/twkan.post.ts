import { getHeader } from 'h3'
import { openManualTwkanSession } from '~/server/services/browser'
import { isLoopbackHost } from '~/server/utils/loopback'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!isLoopbackHost(getHeader(event, 'host')) && !config.remoteBrowserControl) {
    throw createError({ statusCode: 403, statusMessage: 'Remote browser control is disabled. Set REMOTE_BROWSER_CONTROL=true on the Windows host.' })
  }
  return { opened: true, remoteControlEnabled: config.remoteBrowserControl, browser: await openManualTwkanSession() }
})
