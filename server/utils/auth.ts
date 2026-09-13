import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getCookie, getHeader, getRequestURL, setCookie } from 'h3'

const COOKIE_NAME = 'inkrail_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const sessionSecret = () => process.env.OWNER_SESSION_SECRET || useRuntimeConfig().ownerSessionSecret

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function signature(expires: string, secret: string) {
  return createHmac('sha256', secret).update(`inkrail:${expires}`).digest('hex')
}

export function passwordMatches(password: string) {
  const expected = process.env.OWNER_PASSWORD || useRuntimeConfig().ownerPassword
  if (!expected || sessionSecret().length < 32) throw createError({ statusCode: 503, statusMessage: 'Run npm run setup before signing in' })
  return safeEqual(createHmac('sha256', 'inkrail-password').update(password).digest('hex'), createHmac('sha256', 'inkrail-password').update(expected).digest('hex'))
}

export function createOwnerSession(event: H3Event) {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS)
  const secret = sessionSecret()
  const secure = getHeader(event, 'x-forwarded-proto') === 'https' || getRequestURL(event).protocol === 'https:'
  setCookie(event, COOKIE_NAME, `${expires}.${signature(expires, secret)}`, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  })
}

export function clearOwnerSession(event: H3Event) {
  setCookie(event, COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

export function isOwner(event: H3Event) {
  const value = getCookie(event, COOKIE_NAME)
  if (!value) return false
  const [expires, provided] = value.split('.')
  if (sessionSecret().length < 32 || !expires || !provided || !Number.isFinite(Number(expires)) || Number(expires) < Math.floor(Date.now() / 1000)) return false
  return safeEqual(provided, signature(expires, sessionSecret()))
}

export function requireOwner(event: H3Event) {
  if (!isOwner(event)) throw createError({ statusCode: 401, statusMessage: 'Locked' })
}
