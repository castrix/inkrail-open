import { manualTwkanStatus } from '~/server/services/browser'

export default defineEventHandler(async () => ({
  remoteControlEnabled: useRuntimeConfig().remoteBrowserControl,
  browser: await manualTwkanStatus()
}))
