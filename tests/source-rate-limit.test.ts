import { describe, expect, it } from 'vitest'
import { isSourceRateLimit, retryAfterMilliseconds, sourceRateLimitError } from '../server/utils/source-rate-limit'

describe('source rate limits', () => {
  it('supports Retry-After seconds, dates and missing values', () => {
    const now = Date.UTC(2026, 8, 5)
    expect(retryAfterMilliseconds('120', now)).toBe(120_000)
    expect(retryAfterMilliseconds(new Date(now + 90_000).toUTCString(), now)).toBe(90_000)
    expect(retryAfterMilliseconds(null, now)).toBe(60_000)
    expect(retryAfterMilliseconds('invalid', now)).toBe(60_000)
    expect(retryAfterMilliseconds('0', now)).toBe(0)
  })
  it('preserves the source cooldown in an HTTP 429 error', () => {
    const error = sourceRateLimitError('45')
    expect(isSourceRateLimit(error)).toBe(true)
    expect(error.data).toEqual({ retryAfterMs: 45_000 })
    expect(isSourceRateLimit(new Error('Network failed'))).toBe(false)
  })
})
