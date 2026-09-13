import { timingSafeEqual } from 'node:crypto'
import { getRequestURL } from 'h3'
import { requireOwner } from '~/server/utils/auth'

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (path === '/api/internal/source') {
    const expected = process.env.INKRAIL_WORKER_TOKEN || ''; const actual = getHeader(event, 'x-inkrail-worker') || ''
    if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw createError({ statusCode: 401, statusMessage: 'Worker authentication required' })
    return
  }
  if (useRuntimeConfig().authBypass && !path.startsWith('/api/extensions')) return
  if (!path.startsWith('/api/')) return
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    const origin = getHeader(event, 'origin')
    if (origin && new URL(origin).host !== getHeader(event, 'host')) throw createError({ statusCode: 403, statusMessage: 'Cross-origin request rejected' })
  }
  if (path === '/api/auth/login') return
  requireOwner(event)
})
