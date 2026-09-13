import { discoverWebApps } from '~/server/services/apps'

export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  return discoverWebApps(getQuery(event).refresh === 'true')
})
